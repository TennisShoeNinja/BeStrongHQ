"""Google Calendar integration endpoints.

All endpoints take the per-instance DB session via ``Depends(get_db)`` and
thread it through every gcal helper. Tokens, the selected calendar id, and
both event-mapping tables (meet + program-due) live in that instance's
``settings`` table — coaches cannot read or mutate another coach's calendar
state from these routes.

Auth flow mirrors Drive: ``GET /auth/start`` returns a Google OAuth URL,
the browser redirects there, Google redirects back to ``/auth/callback``
which exchanges the code for tokens and saves them in the instance DB.
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from ..gcal import client, sync
from ..models.orm import Athlete, Meet, OAuthState
from .deps import get_db, require_admin
from .error_helpers import safe_error
from .security_logging import security_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


class CalendarAuthStatus(BaseModel):
    has_credentials: bool
    is_authenticated: bool


class CalendarInfo(BaseModel):
    id: str
    name: str
    primary: bool = False


class SetCalendarRequest(BaseModel):
    calendar_id: str


class MeetSyncCounts(BaseModel):
    total_meets: int
    created: int
    updated: int
    errors: list[str]


class ProgramSyncCounts(BaseModel):
    total_programs: int
    created: int
    updated: int
    errors: list[str]


class AthleteSyncCounts(BaseModel):
    """Counts for athlete-keyed categories (availability, birthdays)."""

    total_athletes: int
    created: int
    updated: int
    errors: list[str]


class CalendarSyncResult(BaseModel):
    meets: MeetSyncCounts
    programs: ProgramSyncCounts
    availability: AthleteSyncCounts
    birthdays: AthleteSyncCounts


class CalendarEventsResponse(BaseModel):
    meet_events: dict[str, str]
    program_events: dict[str, str]
    availability_events: dict[str, str]
    birthday_events: dict[str, str]


class SyncOptions(BaseModel):
    meets: bool = True
    programs: bool = True
    availability: bool = False
    birthdays: bool = False


class AuthUrlResponse(BaseModel):
    auth_url: str


class SyncPreviewCounts(BaseModel):
    """How many items in each category are eligible to push to the calendar
    right now. Counts ignore the per-category toggle — the UI shows them
    next to the toggle so the coach can see what they'd get if they turned
    a category on.
    """

    meets: int
    programs: int
    availability: int
    birthdays: int


class SyncErrorEntry(BaseModel):
    category: str
    target_id: str
    label: str
    message: str
    occurred_at: str


class SyncErrorsResponse(BaseModel):
    errors: list[SyncErrorEntry]


def _get_frontend_url(request: Request) -> str:
    """Build the frontend base URL for redirecting after OAuth completes.

    Locally, uses ``FRONTEND_URL`` override or derives from the request.
    """
    mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()

    if mode == "cloud":
        host = request.headers.get("host", "").split(":")[0]
        return f"https://{host}"

    override = os.environ.get("FRONTEND_URL")
    if override:
        return override

    host = request.url.hostname or "localhost"
    port = request.url.port
    scheme = request.url.scheme

    if port == 8080:
        return f"{scheme}://{host}:3000"

    return f"{scheme}://{host}:{port}" if port else f"{scheme}://{host}"


@router.get("/auth/status", response_model=CalendarAuthStatus)
def get_auth_status(request: Request, db: DBSession = Depends(get_db)):
    require_admin(request, db)
    return CalendarAuthStatus(
        has_credentials=client.has_credentials_file(),
        is_authenticated=client.is_authenticated(db=db),
    )


@router.get("/auth/start", response_model=AuthUrlResponse)
def start_auth(request: Request, db: DBSession = Depends(get_db)):
    """Return the Google OAuth consent URL for Calendar access.

    Frontend fetches this through the Next.js proxy and then redirects the
    browser to Google. CSRF state is stored in the instance DB (reuses the
    OAuthState table), so even on a shared host one coach's pending auth
    cannot be hijacked or replayed by another.
    """
    require_admin(request, db)

    if not client.has_credentials_file():
        raise HTTPException(
            status_code=500,
            detail=(
                "Google OAuth not configured. Set GOOGLE_CLIENT_ID and "
                "GOOGLE_CLIENT_SECRET environment variables."
            ),
        )

    redirect_uri = client._get_gcal_redirect_uri(request)
    state = secrets.token_urlsafe(32)


    oauth_state = OAuthState(
        state=state,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(oauth_state)


    now = datetime.utcnow()
    db.query(OAuthState).filter(OAuthState.expires_at < now).delete(
        synchronize_session="fetch"
    )
    db.commit()

    auth_url = client.build_auth_url(state=state, redirect_uri=redirect_uri)
    return AuthUrlResponse(auth_url=auth_url)


@router.get("/auth/callback")
def auth_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: DBSession = Depends(get_db),
):
    """Handle Google OAuth callback for Calendar authorization.

    Validates CSRF state against the instance's OAuthState table, exchanges
    the authorization code for tokens, persists them to the instance
    ``settings`` row, auto-provisions a BeStrongHQ calendar, then redirects
    the browser back to the integrations page with a success or error
    query string.
    """
    frontend_url = _get_frontend_url(request)
    settings_url = f"{frontend_url}/integrations/calendar"

    if error:
        security_log(
            "gcal_auth_denied",
            actor="unknown",
            request=request,
            detail=f"oauth_error={error}",
        )
        return RedirectResponse(url=f"{settings_url}?{urlencode({'error': error})}")


    oauth_state = (
        db.query(OAuthState).filter(OAuthState.state == state).first()
    )
    if not oauth_state:
        return RedirectResponse(url=f"{settings_url}?error=invalid_state")
    if oauth_state.expires_at < datetime.utcnow():
        db.delete(oauth_state)
        db.commit()
        return RedirectResponse(url=f"{settings_url}?error=state_expired")

    db.delete(oauth_state)
    db.commit()

    if not code:
        return RedirectResponse(url=f"{settings_url}?error=no_code")

    redirect_uri = client._get_gcal_redirect_uri(request)
    token_resp = http_requests.post(
        client.GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": client._get_google_client_id(),
            "client_secret": client._get_google_client_secret(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )

    if token_resp.status_code != 200:
        logger.warning(
            "Calendar token exchange failed: status=%s body=%s",
            token_resp.status_code,
            token_resp.text[:300],
        )
        return RedirectResponse(url=f"{settings_url}?error=token_exchange_failed")

    tokens = token_resp.json()

    try:
        client.save_tokens_from_oauth_response(tokens, db=db)
    except ValueError:
        return RedirectResponse(url=f"{settings_url}?error=missing_tokens")


    try:
        client.ensure_bestronghq_calendar(db=db)
    except Exception as cal_err:  # noqa: BLE001
        logger.warning("BeStrongHQ provisioning after auth failed: %s", cal_err)

    security_log(
        "gcal_auth_success",
        actor=request.headers.get("host", "unknown"),
        request=request,
        detail="gcal tokens stored",
    )

    return RedirectResponse(url=settings_url, status_code=302)


@router.post("/auth/disconnect")
def disconnect_calendar(request: Request, db: DBSession = Depends(get_db)):
    """Remove this instance's stored Google Calendar token. Idempotent."""
    require_admin(request, db)
    client.disconnect(db=db)
    security_log(
        "gcal_auth_disconnected",
        actor=request.headers.get("host", "unknown"),
        request=request,
        detail="gcal tokens cleared",
    )
    return {"status": "ok"}


@router.get("/calendars", response_model=list[CalendarInfo])
def list_calendars(request: Request, db: DBSession = Depends(get_db)):
    require_admin(request, db)
    try:
        calendars = client.list_calendars(db=db)
        return [CalendarInfo(**c) for c in calendars]
    except RuntimeError as e:
        safe_error(e, "Failed to list Google Calendar calendars", status_code=401)


@router.get("/selected")
def get_selected_calendar(request: Request, db: DBSession = Depends(get_db)):
    require_admin(request, db)
    return {"calendar_id": client.get_calendar_id(db=db)}


@router.post("/selected")
def set_selected_calendar(req: SetCalendarRequest, request: Request, db: DBSession = Depends(get_db)):
    require_admin(request, db)
    client.set_calendar_id(req.calendar_id, db=db)
    return {"status": "ok", "calendar_id": req.calendar_id}


@router.post("/ensure-bestronghq")
def ensure_bestronghq(request: Request, db: DBSession = Depends(get_db)):
    """Create (or find) a 'BeStrongHQ' calendar on the connected account
    and select it. Idempotent.
    """
    require_admin(request, db)
    try:
        cal_id = client.ensure_bestronghq_calendar(db=db)
        return {"status": "ok", "calendar_id": cal_id}
    except RuntimeError as e:
        safe_error(e, "Failed to access Google Calendar", status_code=401)
    except Exception as e:
        safe_error(e, "Failed to ensure BeStrongHQ calendar", status_code=500)


@router.post("/sync", response_model=CalendarSyncResult)
def sync_calendar(request: Request, db: DBSession = Depends(get_db)):
    """Push every enabled category for the requesting instance only.

    Which categories run is governed by ``gcal_sync_options`` in the
    instance settings table. Disabled categories return zeroed counts.
    """
    require_admin(request, db)
    try:
        result = sync.sync_all(db)
        return CalendarSyncResult(
            meets=MeetSyncCounts(**result["meets"]),
            programs=ProgramSyncCounts(**result["programs"]),
            availability=AthleteSyncCounts(**result["availability"]),
            birthdays=AthleteSyncCounts(**result["birthdays"]),
        )
    except RuntimeError as e:
        safe_error(e, "Failed to sync calendar with Google", status_code=401)
    except Exception as e:
        safe_error(e, "Failed to sync calendar", status_code=500)


@router.get("/sync-options", response_model=SyncOptions)
def get_sync_options(request: Request, db: DBSession = Depends(get_db)):
    """Return the per-instance 'What to sync' toggle state."""
    require_admin(request, db)
    return SyncOptions(**client.get_sync_options(db=db))


@router.post("/sync-options", response_model=SyncOptions)
def set_sync_options(
    options: SyncOptions, request: Request, db: DBSession = Depends(get_db)
):
    """Persist the 'What to sync' toggle state for this instance.

    Unchecking a category stops new events from being pushed for that
    category but does NOT delete already-pushed events — the coach
    removes those manually if they don't want them anymore.
    """
    require_admin(request, db)
    saved = client.save_sync_options(options.model_dump(), db=db)
    return SyncOptions(**saved)


@router.post("/sync/meets/{meet_id}")
def sync_single_meet(meet_id: int, request: Request, db: DBSession = Depends(get_db)):
    require_admin(request, db)
    try:
        event_id = sync.sync_single_meet(db, meet_id)
        return {"status": "ok", "event_id": event_id}
    except ValueError as e:
        safe_error(e, "Meet not found", status_code=404)
    except RuntimeError as e:
        safe_error(e, "Failed to sync calendar with Google", status_code=401)
    except Exception as e:
        safe_error(e, "Failed to sync meet to calendar", status_code=500)


@router.post("/sync/programs/{athlete_id}")
def sync_single_program(athlete_id: int, request: Request, db: DBSession = Depends(get_db)):
    require_admin(request, db)
    try:
        event_id = sync.sync_single_athlete_program(db, athlete_id)
        return {"status": "ok", "event_id": event_id}
    except ValueError as e:
        safe_error(e, "Athlete or program-due date not found", status_code=404)
    except RuntimeError as e:
        safe_error(e, "Failed to sync calendar with Google", status_code=401)
    except Exception as e:
        safe_error(e, "Failed to sync program-due to calendar", status_code=500)


@router.post("/sync/{meet_id}")
def sync_single_meet_legacy(meet_id: int, request: Request, db: DBSession = Depends(get_db)):
    return sync_single_meet(meet_id, request, db)


@router.get("/events", response_model=CalendarEventsResponse)
def get_event_mapping(request: Request, db: DBSession = Depends(get_db)):
    require_admin(request, db)
    return CalendarEventsResponse(
        meet_events=client.get_event_mapping(db=db),
        program_events=client.get_program_event_mapping(db=db),
        availability_events=client.get_availability_event_mapping(db=db),
        birthday_events=client.get_birthday_event_mapping(db=db),
    )


def _count_parseable_dobs(db: DBSession) -> int:
    """Count active athletes whose ``dob`` parses in any of the formats the
    sync accepts. Mirrors the parsing rules in ``sync.sync_all_birthdays``
    so the preview number matches what would actually push.
    """
    from datetime import datetime as _dt

    rows = (
        db.query(Athlete.dob)
        .filter(Athlete.archived.is_(False))
        .filter(Athlete.dob.isnot(None))
        .filter(Athlete.dob != "")
        .all()
    )
    count = 0
    for (raw,) in rows:
        s = (raw or "").strip()
        if not s:
            continue
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
            try:
                _dt.strptime(s, fmt)
                count += 1
                break
            except ValueError:
                continue
    return count


@router.get("/sync-preview", response_model=SyncPreviewCounts)
def get_sync_preview(request: Request, db: DBSession = Depends(get_db)):
    """Return how many items in each category are eligible to push.

    These are the counts the coach should see next to each "What to sync"
    toggle so they know what hitting Sync everything will do — independent
    of whether anything is on the calendar yet.
    """
    require_admin(request, db)

    eligible_meets = (
        db.query(Meet)
        .filter(Meet.meet_date.isnot(None))
        .filter(Meet.meet_date != "")
        .all()
    )
    meets_count = sum(1 for m in eligible_meets if not sync._is_past_meet(m))
    programs_count = (
        db.query(Athlete)
        .filter(Athlete.archived.is_(False))
        .filter(Athlete.program_due.isnot(None))
        .filter(Athlete.program_due != "")
        .count()
    )
    eligible_availability = (
        db.query(Athlete)
        .filter(Athlete.archived.is_(False))
        .filter(Athlete.out_from.isnot(None))
        .filter(Athlete.out_from != "")
        .filter(Athlete.out_through.isnot(None))
        .filter(Athlete.out_through != "")
        .all()
    )
    availability_count = sum(
        1 for a in eligible_availability if not sync._is_past_availability(a)
    )
    birthdays_count = _count_parseable_dobs(db)

    return SyncPreviewCounts(
        meets=meets_count,
        programs=programs_count,
        availability=availability_count,
        birthdays=birthdays_count,
    )


@router.get("/sync-errors", response_model=SyncErrorsResponse)
def get_sync_errors(request: Request, db: DBSession = Depends(get_db)):
    """Return outstanding calendar sync issues for this instance. Successful
    re-sync of a target clears its entry, so this is "what's broken right
    now" rather than an audit log.
    """
    require_admin(request, db)
    raw = client.list_sync_errors(db=db)
    return SyncErrorsResponse(
        errors=[SyncErrorEntry(**e) for e in raw if isinstance(e, dict)]
    )


@router.post("/sync-errors/clear")
def clear_sync_errors(request: Request, db: DBSession = Depends(get_db)):
    """Empty the outstanding-issue buffer. Used by the 'Dismiss all' UI."""
    require_admin(request, db)
    client.clear_all_sync_errors(db=db)
    return {"status": "ok"}
