"""Google Calendar integration — web-redirect OAuth + meet/program sync.

Authentication uses a web-redirect OAuth flow (mirroring the Drive client)
so it works on headless servers and per-instance deployments. Tokens live in
each instance's ``settings`` table under ``gcal_token_json`` — no module-level
state, no shared file paths, nothing readable from another instance's session.

The OAuth client credentials are shared with Drive (``GOOGLE_CLIENT_ID`` /
``GOOGLE_CLIENT_SECRET`` env vars or the per-purpose ``GOOGLE_DRIVE_*``
override) so operators don't need to register a separate calendar OAuth
client. Calendar scope is always requested fresh, independent of Drive.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


_CONFIG_DIR = Path.home() / ".bestrong" / "gcal"
_TOKEN_PATH = _CONFIG_DIR / "token.json"
_SETTINGS_PATH = _CONFIG_DIR / "settings.json"


def _ensure_config_dir() -> None:
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def _get_google_client_id() -> str:
    """Return the Google OAuth client_id used for calendar auth.

    Shares the ``drive`` purpose so operators only need to register one
    OAuth client. The calendar scope is requested independently at consent
    time, so this does not grant Drive access on its own.
    """
    from ..utils.oauth_config import get_oauth_client

    return get_oauth_client("drive")[0]


def _get_google_client_secret() -> str:
    from ..utils.oauth_config import get_oauth_client

    return get_oauth_client("drive")[1]


def _get_gcal_redirect_uri(request=None) -> str:
    """Build the Calendar OAuth callback URI.

    Locally, uses ``FRONTEND_URL`` if set, otherwise points at FastAPI
    on 127.0.0.1:8080 directly so the browser hits the API for the
    callback without depending on ``NEXT_PUBLIC_API_URL``.
    """
    mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()

    if mode == "cloud" and request is not None:
        host = request.headers.get("host", "").split(":")[0]
        return f"https://{host}/api/calendar/auth/callback"

    frontend_url = os.environ.get("FRONTEND_URL")
    if frontend_url:
        return f"{frontend_url.rstrip('/')}/api/calendar/auth/callback"

    return "http://127.0.0.1:8080/api/calendar/auth/callback"


def _get_db_session(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> tuple[DBSession, bool]:
    if db is not None:
        return db, False
    from ..models.database import get_session
    return get_session(db_path), True


def _get_setting_value(
    key: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str | None:
    from ..models.orm import Setting

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        row = session.query(Setting).filter(Setting.key == key).first()
        return row.value if row else None
    finally:
        if owns_session:
            session.close()


def _set_setting_value(
    key: str,
    value: str | None,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    from ..models.orm import Setting

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        row = session.query(Setting).filter(Setting.key == key).first()
        if row:
            row.value = value
        else:
            session.add(Setting(key=key, value=value))
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


def has_credentials_file() -> bool:
    """Whether OAuth client credentials are configured.

    Returns True if the operator has configured ``GOOGLE_CLIENT_ID`` /
    ``GOOGLE_CLIENT_SECRET`` (or the per-purpose ``GOOGLE_DRIVE_*`` override).
    The legacy ``credentials.json`` file path is also accepted via
    ``oauth_config.get_oauth_client``.
    """
    return bool(_get_google_client_id() and _get_google_client_secret())


def is_authenticated(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> bool:
    return get_credentials(db=db, db_path=db_path) is not None


def get_credentials(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> Credentials | None:
    token_json = _get_setting_value("gcal_token_json", db=db, db_path=db_path)
    if not token_json:
        if db is not None or db_path is not None:
            return None
        if not _TOKEN_PATH.exists():
            return None
        token_json = _TOKEN_PATH.read_text()
    try:
        creds = Credentials.from_authorized_user_info(json.loads(token_json), SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            _save_token(creds, db=db, db_path=db_path)
        return creds if creds.valid else None
    except Exception as exc:
        logger.warning("Calendar token refresh failed (%s). Removing stale token.", exc)
        if db is None and db_path is None:
            try:
                _TOKEN_PATH.unlink(missing_ok=True)
            except OSError:
                pass
        else:
            _set_setting_value("gcal_token_json", None, db=db, db_path=db_path)
        return None


def build_auth_url(state: str, redirect_uri: str) -> str:
    """Return the Google OAuth consent URL for Calendar access.

    Caller is responsible for generating and persisting the CSRF ``state``
    (typically in the ``OAuthState`` table, like Drive auth does).
    ``prompt=consent`` ensures Google returns a refresh_token every time —
    without it, re-authenticating an already-granted client returns
    access-only and we lose the ability to refresh after expiry.
    """
    client_id = _get_google_client_id()
    if not client_id:
        raise RuntimeError(
            "Google OAuth not configured. Set GOOGLE_CLIENT_ID and "
            "GOOGLE_CLIENT_SECRET environment variables."
        )

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "state": state,
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}"


def save_tokens_from_oauth_response(
    tokens: dict,
    *,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Persist the token JSON from a successful OAuth code exchange.

    ``tokens`` is the raw JSON dict returned by Google's token endpoint
    (must contain at least ``access_token`` and ``refresh_token``). We
    reshape it into the ``Credentials.from_authorized_user_info`` schema so
    the existing ``get_credentials`` refresh path keeps working unchanged.

    Strictly instance-scoped: the resulting JSON is written via
    ``_set_setting_value`` against the provided ``db`` session. Two coaches
    on the same host will write to different instance DBs and cannot read
    each other's tokens.
    """
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    if not access_token or not refresh_token:
        raise ValueError("OAuth response missing access_token or refresh_token")

    expires_in = tokens.get("expires_in")
    expiry_iso: str | None = None
    if expires_in:
        expiry = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        expiry_iso = expiry.replace(tzinfo=None).isoformat() + "Z"

    scopes_returned = tokens.get("scope", " ".join(SCOPES)).split()

    creds_payload: dict[str, Any] = {
        "token": access_token,
        "refresh_token": refresh_token,
        "token_uri": GOOGLE_TOKEN_URL,
        "client_id": _get_google_client_id(),
        "client_secret": _get_google_client_secret(),
        "scopes": scopes_returned,
    }
    if expiry_iso:
        creds_payload["expiry"] = expiry_iso

    payload = json.dumps(creds_payload)

    if db is None and db_path is None:
        _ensure_config_dir()
        _TOKEN_PATH.write_text(payload)
        return
    _set_setting_value("gcal_token_json", payload, db=db, db_path=db_path)


def disconnect(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Remove the stored Calendar token for this instance. Idempotent."""
    if db is None and db_path is None:
        try:
            _TOKEN_PATH.unlink(missing_ok=True)
        except OSError:
            pass
        return
    _set_setting_value("gcal_token_json", None, db=db, db_path=db_path)


def _save_token(
    creds: Credentials,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Persist already-built Credentials. Used by the refresh path in
    ``get_credentials`` to write back the rotated access_token; not used
    by the OAuth callback (which goes through ``save_tokens_from_oauth_response``).
    """
    token_json = creds.to_json()
    if db is None and db_path is None:
        _ensure_config_dir()
        _TOKEN_PATH.write_text(token_json)
        return
    _set_setting_value("gcal_token_json", token_json, db=db, db_path=db_path)


def _get_service(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
):
    creds = get_credentials(db=db, db_path=db_path)
    if creds is None:
        raise RuntimeError("Not authenticated with Google Calendar. Run auth flow first.")
    return build("calendar", "v3", credentials=creds)


def get_settings() -> dict[str, Any]:
    if not _SETTINGS_PATH.exists():
        return {}
    return json.loads(_SETTINGS_PATH.read_text())


def save_settings(settings: dict[str, Any]) -> None:
    _ensure_config_dir()
    _SETTINGS_PATH.write_text(json.dumps(settings, indent=2))


def get_calendar_id(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str:
    """Get the selected calendar ID (default: 'primary')."""
    value = _get_setting_value("gcal_calendar_id", db=db, db_path=db_path)
    if value:
        return value
    if db is not None or db_path is not None:
        return "primary"
    return get_settings().get("calendar_id", "primary")


def set_calendar_id(
    calendar_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    if db is None and db_path is None:
        settings = get_settings()
        settings["calendar_id"] = calendar_id
        save_settings(settings)
        return
    _set_setting_value("gcal_calendar_id", calendar_id, db=db, db_path=db_path)


def get_event_mapping(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict[str, str]:
    """Get mapping of meet_id -> gcal_event_id for tracking synced events."""
    value = _get_setting_value("gcal_event_mapping", db=db, db_path=db_path)
    if value:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON in gcal_event_mapping")
    if db is not None or db_path is not None:
        return {}
    return get_settings().get("event_mapping", {})


def save_event_mapping(
    mapping: dict[str, str],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    if db is None and db_path is None:
        settings = get_settings()
        settings["event_mapping"] = mapping
        save_settings(settings)
        return
    _set_setting_value("gcal_event_mapping", json.dumps(mapping), db=db, db_path=db_path)


def get_program_event_mapping(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict[str, str]:
    """Get mapping of athlete_id -> gcal_event_id for synced program-due events.

    Stored separately from meet events so the two cannot collide on integer id.
    """
    value = _get_setting_value("gcal_program_event_mapping", db=db, db_path=db_path)
    if value:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON in gcal_program_event_mapping")
    if db is not None or db_path is not None:
        return {}
    return get_settings().get("program_event_mapping", {})


def save_program_event_mapping(
    mapping: dict[str, str],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    if db is None and db_path is None:
        settings = get_settings()
        settings["program_event_mapping"] = mapping
        save_settings(settings)
        return
    _set_setting_value(
        "gcal_program_event_mapping", json.dumps(mapping), db=db, db_path=db_path
    )


def get_availability_event_mapping(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict[str, str]:
    """Mapping of athlete_id -> gcal_event_id for athlete-availability
    events (the "athlete is unavailable" date-range events). Stored
    separately from meet/program events so they cannot collide.
    """
    value = _get_setting_value("gcal_availability_event_mapping", db=db, db_path=db_path)
    if value:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON in gcal_availability_event_mapping")
    if db is not None or db_path is not None:
        return {}
    return get_settings().get("availability_event_mapping", {})


def save_availability_event_mapping(
    mapping: dict[str, str],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    if db is None and db_path is None:
        settings = get_settings()
        settings["availability_event_mapping"] = mapping
        save_settings(settings)
        return
    _set_setting_value(
        "gcal_availability_event_mapping", json.dumps(mapping), db=db, db_path=db_path
    )


def get_birthday_event_mapping(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict[str, str]:
    """Mapping of athlete_id -> gcal_event_id for athlete-birthday events
    (a single yearly-recurring event per athlete). Stored separately
    from the other event mappings.
    """
    value = _get_setting_value("gcal_birthday_event_mapping", db=db, db_path=db_path)
    if value:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON in gcal_birthday_event_mapping")
    if db is not None or db_path is not None:
        return {}
    return get_settings().get("birthday_event_mapping", {})


def save_birthday_event_mapping(
    mapping: dict[str, str],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    if db is None and db_path is None:
        settings = get_settings()
        settings["birthday_event_mapping"] = mapping
        save_settings(settings)
        return
    _set_setting_value(
        "gcal_birthday_event_mapping", json.dumps(mapping), db=db, db_path=db_path
    )


_SYNC_OPTION_DEFAULTS = {
    "meets": True,
    "programs": True,
    "availability": False,
    "birthdays": False,
}


_SYNC_OPTIONS_KEY = "gcal_sync_options"


def get_sync_options(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict[str, bool]:
    """Return the per-instance sync-category toggle dict. Unknown / missing
    keys fall back to defaults so coaches who haven't visited the new UI
    keep getting meets + programs synced.
    """
    raw = _get_setting_value(_SYNC_OPTIONS_KEY, db=db, db_path=db_path)
    stored: dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                stored = parsed
        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON in %s", _SYNC_OPTIONS_KEY)

    return {
        key: bool(stored.get(key, default))
        for key, default in _SYNC_OPTION_DEFAULTS.items()
    }


def save_sync_options(
    options: dict[str, bool],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict[str, bool]:
    """Persist the toggle dict, dropping any unknown keys and coercing
    everything to bool. Returns the canonical merged result so the
    caller can echo it back.
    """
    cleaned = {
        key: bool(options.get(key, default))
        for key, default in _SYNC_OPTION_DEFAULTS.items()
    }
    _set_setting_value(
        _SYNC_OPTIONS_KEY, json.dumps(cleaned), db=db, db_path=db_path
    )
    return cleaned


_SYNC_ERRORS_KEY = "gcal_sync_errors"
_SYNC_ERRORS_MAX = 50


def list_sync_errors(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[dict[str, Any]]:
    """Return outstanding sync errors, newest first. Each entry has
    ``category``, ``target_id``, ``label``, ``message``, ``occurred_at``.
    """
    raw = _get_setting_value(_SYNC_ERRORS_KEY, db=db, db_path=db_path)
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Ignoring invalid JSON in %s", _SYNC_ERRORS_KEY)
        return []
    if not isinstance(parsed, list):
        return []
    return [e for e in parsed if isinstance(e, dict)]


def _save_sync_errors(
    entries: list[dict[str, Any]],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    trimmed = entries[:_SYNC_ERRORS_MAX]
    _set_setting_value(
        _SYNC_ERRORS_KEY, json.dumps(trimmed), db=db, db_path=db_path
    )


def record_sync_error(
    category: str,
    target_id: int | str,
    label: str,
    message: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Add or replace the outstanding-issue entry for ``(category, target_id)``.
    Newest-first; bumps the entry to the top if it already exists.
    """
    entries = list_sync_errors(db=db, db_path=db_path)
    target_key = str(target_id)
    filtered = [
        e for e in entries
        if not (e.get("category") == category and str(e.get("target_id")) == target_key)
    ]
    new_entry = {
        "category": category,
        "target_id": target_key,
        "label": label,
        "message": message[:500],
        "occurred_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z",
    }
    _save_sync_errors([new_entry, *filtered], db=db, db_path=db_path)


def clear_sync_error(
    category: str,
    target_id: int | str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Drop the outstanding-issue entry for ``(category, target_id)`` if any.
    Called after a successful push so resolved errors auto-disappear.
    """
    entries = list_sync_errors(db=db, db_path=db_path)
    target_key = str(target_id)
    filtered = [
        e for e in entries
        if not (e.get("category") == category and str(e.get("target_id")) == target_key)
    ]
    if len(filtered) != len(entries):
        _save_sync_errors(filtered, db=db, db_path=db_path)


def clear_all_sync_errors(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Empty the buffer. Used by the 'Dismiss all' UI action."""
    _set_setting_value(_SYNC_ERRORS_KEY, json.dumps([]), db=db, db_path=db_path)


BESTRONG_CALENDAR_NAME = "BeStrongHQ"


def list_calendars(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """List all calendars the user has access to."""
    service = _get_service(db=db, db_path=db_path)
    result = service.calendarList().list().execute()
    calendars = []
    for cal in result.get("items", []):
        calendars.append({
            "id": cal["id"],
            "name": cal.get("summary", "Untitled"),
            "primary": cal.get("primary", False),
        })
    return calendars


def ensure_bestronghq_calendar(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str:
    """Find (or create) a calendar named 'BeStrongHQ' on the coach's Google
    account and return its id. Idempotent — safe to call repeatedly.

    Instance-scoped: the OAuth credentials are read from the per-instance
    ``gcal_token_json`` setting via ``_get_service``, so this only ever talks
    to the calendar account belonging to the coach whose ``db`` was passed
    in. It will never touch another instance's calendars.

    The selected calendar id (``gcal_calendar_id`` setting) is also written
    when not yet set, so the very first sync after auth lands in BeStrongHQ
    instead of the coach's primary calendar.
    """
    service = _get_service(db=db, db_path=db_path)


    existing_id: str | None = None
    page_token: str | None = None
    while True:
        kwargs: dict[str, Any] = {}
        if page_token:
            kwargs["pageToken"] = page_token
        result = service.calendarList().list(**kwargs).execute()
        for cal in result.get("items", []):
            if cal.get("summary") == BESTRONG_CALENDAR_NAME:
                existing_id = cal["id"]
                break
        if existing_id:
            break
        page_token = result.get("nextPageToken")
        if not page_token:
            break

    if existing_id is None:
        created = service.calendars().insert(
            body={"summary": BESTRONG_CALENDAR_NAME}
        ).execute()
        existing_id = created["id"]


    current = _get_setting_value("gcal_calendar_id", db=db, db_path=db_path)
    if not current:
        set_calendar_id(existing_id, db=db, db_path=db_path)

    return existing_id


def create_or_update_event(
    meet_id: int,
    title: str,
    start_date: str,
    end_date: str | None = None,
    location: str | None = None,
    description: str | None = None,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str:
    """Create or update a Google Calendar event for a meet.

    Returns the event ID.
    """
    service = _get_service(db=db, db_path=db_path)
    calendar_id = get_calendar_id(db=db, db_path=db_path)
    mapping = get_event_mapping(db=db, db_path=db_path)


    event_body: dict[str, Any] = {
        "summary": title,
        "start": {"date": start_date},
        "end": {"date": end_date or start_date},
        "description": description or "",
        "extendedProperties": {
            "private": {
                "bestrong_kind": "meet",
                "bestrong_meet_id": str(meet_id),
            }
        },
    }
    if location:
        event_body["location"] = location

    existing_event_id = mapping.get(str(meet_id))

    if existing_event_id:

        try:
            event = service.events().update(
                calendarId=calendar_id,
                eventId=existing_event_id,
                body=event_body,
            ).execute()
            return event["id"]
        except Exception:

            pass


    event = service.events().insert(
        calendarId=calendar_id,
        body=event_body,
    ).execute()


    mapping[str(meet_id)] = event["id"]
    save_event_mapping(mapping, db=db, db_path=db_path)

    return event["id"]


def create_or_update_program_event(
    athlete_id: int,
    title: str,
    due_date: str,
    description: str | None = None,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str:
    """Create or update a Google Calendar event for an athlete's program-due
    date. Stored under a separate mapping (``gcal_program_event_mapping``)
    keyed on athlete_id, so it can never collide with meet events even if
    they share the same integer id.

    Returns the event ID.
    """
    service = _get_service(db=db, db_path=db_path)
    calendar_id = get_calendar_id(db=db, db_path=db_path)
    mapping = get_program_event_mapping(db=db, db_path=db_path)

    event_body: dict[str, Any] = {
        "summary": title,
        "start": {"date": due_date},
        "end": {"date": due_date},
        "description": description or "",
        "extendedProperties": {
            "private": {
                "bestrong_kind": "program_due",
                "bestrong_athlete_id": str(athlete_id),
            }
        },
    }

    existing_event_id = mapping.get(str(athlete_id))
    if existing_event_id:
        try:
            event = service.events().update(
                calendarId=calendar_id,
                eventId=existing_event_id,
                body=event_body,
            ).execute()
            return event["id"]
        except Exception:

            pass

    event = service.events().insert(
        calendarId=calendar_id,
        body=event_body,
    ).execute()

    mapping[str(athlete_id)] = event["id"]
    save_program_event_mapping(mapping, db=db, db_path=db_path)
    return event["id"]


def create_or_update_availability_event(
    athlete_id: int,
    title: str,
    start_date: str,
    end_date: str,
    description: str | None = None,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str:
    """Create or update an availability (date-range) event for an athlete.

    All-day event spanning ``start_date`` (inclusive) to ``end_date``
    (Google's all-day end is exclusive, so the caller is responsible
    for adding one day to ``end_date`` if they want the displayed range
    to include the actual end day). Returns the event ID.
    """
    service = _get_service(db=db, db_path=db_path)
    calendar_id = get_calendar_id(db=db, db_path=db_path)
    mapping = get_availability_event_mapping(db=db, db_path=db_path)

    event_body: dict[str, Any] = {
        "summary": title,
        "start": {"date": start_date},
        "end": {"date": end_date},
        "description": description or "",
        "extendedProperties": {
            "private": {
                "bestrong_kind": "availability",
                "bestrong_athlete_id": str(athlete_id),
            }
        },
    }

    existing_event_id = mapping.get(str(athlete_id))
    if existing_event_id:
        try:
            event = service.events().update(
                calendarId=calendar_id,
                eventId=existing_event_id,
                body=event_body,
            ).execute()
            return event["id"]
        except Exception:
            pass

    event = service.events().insert(
        calendarId=calendar_id,
        body=event_body,
    ).execute()

    mapping[str(athlete_id)] = event["id"]
    save_availability_event_mapping(mapping, db=db, db_path=db_path)
    return event["id"]


def create_or_update_birthday_event(
    athlete_id: int,
    title: str,
    birth_date: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str:
    """Create or update a yearly-recurring birthday event for an athlete.

    ``birth_date`` is the full ISO date the athlete was born on. Google
    handles the recurrence — we set the event's start to the birth date
    itself and attach ``RRULE:FREQ=YEARLY``, so it appears on every
    subsequent year automatically without us needing to re-sync each
    January.
    """
    service = _get_service(db=db, db_path=db_path)
    calendar_id = get_calendar_id(db=db, db_path=db_path)
    mapping = get_birthday_event_mapping(db=db, db_path=db_path)


    from datetime import date as _date_type, timedelta as _td

    parsed = _date_type.fromisoformat(birth_date)
    end_date = (parsed + _td(days=1)).isoformat()

    event_body: dict[str, Any] = {
        "summary": title,
        "start": {"date": birth_date},
        "end": {"date": end_date},
        "recurrence": ["RRULE:FREQ=YEARLY"],
        "transparency": "transparent",
        "extendedProperties": {
            "private": {
                "bestrong_kind": "birthday",
                "bestrong_athlete_id": str(athlete_id),
            }
        },
    }

    existing_event_id = mapping.get(str(athlete_id))
    if existing_event_id:
        try:
            event = service.events().update(
                calendarId=calendar_id,
                eventId=existing_event_id,
                body=event_body,
            ).execute()
            return event["id"]
        except Exception:
            pass

    event = service.events().insert(
        calendarId=calendar_id,
        body=event_body,
    ).execute()

    mapping[str(athlete_id)] = event["id"]
    save_birthday_event_mapping(mapping, db=db, db_path=db_path)
    return event["id"]


def delete_event(
    meet_id: int,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> bool:
    """Delete the calendar event for a meet. Returns True if deleted."""
    service = _get_service(db=db, db_path=db_path)
    calendar_id = get_calendar_id(db=db, db_path=db_path)
    mapping = get_event_mapping(db=db, db_path=db_path)

    event_id = mapping.get(str(meet_id))
    if not event_id:
        return False

    try:
        service.events().delete(
            calendarId=calendar_id,
            eventId=event_id,
        ).execute()
    except Exception:
        pass

    del mapping[str(meet_id)]
    save_event_mapping(mapping, db=db, db_path=db_path)
    return True
