"""OpenPowerlifting integration endpoints — search, link, refresh, unlink.

The OpenPowerlifting dataset is public domain, so no configuration
gates the lookup. When auth is enabled, the standard auth middleware
protects these endpoints at the request level.

Imported meets land directly in the ``meet_results`` table with
``source='opl'`` so the existing athlete-profile MeetHistoryCard
renders them with no special-case code. The ``opl_meets`` table from
the earlier prototype is no longer written to; it's left in place to
avoid forcing a destructive migration on existing DBs.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models.orm import Athlete, MeetResult, OplLink
from ..opl import OplError, fetch_lifter_csv, search_lifters
from ..opl.client import OPL_BASE
from ..services.max_tracking import log_max_changes
from .deps import get_db
from .error_helpers import safe_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/opl", tags=["openpowerlifting"])


_OPL_SOURCE = "opl"
_COMPETITION_LIFTS = ("squat", "bench", "deadlift")
_MAX_FIELD_BY_LIFT = {
    "squat": "squat_max_lbs",
    "bench": "bench_max_lbs",
    "deadlift": "deadlift_max_lbs",
}


# --- Schemas ---


class OplCandidate(BaseModel):
    slug: str
    name: str
    federation: str | None = None
    country: str | None = None
    state: str | None = None
    sex: str | None = None
    equipment: str | None = None
    age_class: str | None = None
    division: str | None = None
    best_total_lbs: float | None = None
    best_dots: float | None = None
    weight_class_lbs: str | None = None
    last_meet_date: str | None = None


class OplSearchResponse(BaseModel):
    query: str
    candidates: list[OplCandidate]


class OplLinkInfo(BaseModel):
    slug: str
    display_name: str | None
    last_synced_at: datetime | None
    last_sync_error: str | None
    profile_url: str


class OplStatusResponse(BaseModel):
    linked: bool
    link: OplLinkInfo | None = None


class OplLinkRequest(BaseModel):
    slug: str
    display_name: str | None = None


class OplLinkResult(BaseModel):
    linked: bool
    imported_attempts: int
    link: OplLinkInfo | None = None


# --- Helpers ---


def _profile_url(slug: str) -> str:
    return f"{OPL_BASE}/u/{slug}"


def _serialize_link(link: OplLink) -> OplLinkInfo:
    return OplLinkInfo(
        slug=link.slug,
        display_name=link.display_name,
        last_synced_at=link.last_synced_at,
        last_sync_error=link.last_sync_error,
        profile_url=_profile_url(link.slug),
    )


def _delete_opl_meet_results(db: Session, athlete_id: int) -> None:
    """Wipe every OPL-sourced meet_results row for this athlete.

    Used by relink-to-different-slug, refresh (so stale meets don't
    linger when OPL retires a result), and unlink. Coach-entered rows
    (source='manual') are untouched.
    """
    db.query(MeetResult).filter(
        MeetResult.athlete_id == athlete_id,
        MeetResult.source == _OPL_SOURCE,
    ).delete(synchronize_session=False)


def _import_meets_to_meet_results(
    db: Session, athlete: Athlete, meets: list[dict[str, Any]]
) -> int:
    """Replace every OPL row for the athlete with the freshly fetched set.

    Strategy: delete-then-insert by source='opl'. We considered upserting
    on (athlete_id, external_meet_path, lift, attempt) but a delete-and-
    rewrite is simpler, has no partial-update edge cases, and OPL meet
    histories are tiny (a few dozen rows at most). The athlete's
    coach-entered rows (source='manual') stay intact because the delete
    is scoped by source.

    Returns the number of attempt rows actually written.
    """
    _delete_opl_meet_results(db, athlete.id)
    db.flush()

    written = 0
    for meet in meets:
        meet_path = meet.get("meet_path")
        meet_name = meet.get("meet_name")
        meet_date = meet.get("meet_date")
        federation = meet.get("federation")
        weight_class = meet.get("weight_class_kg")
        weight_class_label = (
            f"{weight_class} kg" if weight_class else None
        )
        division = meet.get("division")
        attempts = meet.get("attempts") or []
        for attempt in attempts:
            lift = attempt["lift"]
            if lift not in _COMPETITION_LIFTS:
                continue
            db.add(
                MeetResult(
                    athlete_id=athlete.id,
                    meet_id=None,
                    meet_name=meet_name,
                    meet_date=meet_date,
                    federation=federation,
                    weight_class=weight_class_label,
                    division=division,
                    lift=lift,
                    attempt_number=attempt["attempt_number"],
                    weight_lbs=attempt["weight_lbs"],
                    made=attempt["made"],
                    notes=None,
                    source=_OPL_SOURCE,
                    external_meet_path=meet_path,
                )
            )
            written += 1
    return written


def _refresh_athlete_maxes(db: Session, athlete: Athlete) -> None:
    """Recalculate competition maxes from current meet_results, log deltas.

    Mirrors the auto-update logic in routes_meet_results.save_meet_results
    so an OPL import lifts the athlete's tracked maxes when a heavier
    competition lift exists than what's on file. Only made attempts
    count. We never demote a max that came from training (e.g. a 600
    training squat shouldn't be lowered just because the athlete
    competes at 500); the existing log_max_changes helper guards on
    "is the new value actually higher" via the caller, so we only feed
    it lifts that strictly improve the current best.
    """
    rows = (
        db.query(MeetResult)
        .filter(MeetResult.athlete_id == athlete.id, MeetResult.made.is_(True))
        .all()
    )
    best_by_lift: dict[str, float] = {}
    for r in rows:
        cur = best_by_lift.get(r.lift)
        if cur is None or r.weight_lbs > cur:
            best_by_lift[r.lift] = r.weight_lbs

    updates: dict[str, float] = {}
    for lift, best in best_by_lift.items():
        field = _MAX_FIELD_BY_LIFT.get(lift)
        if field is None:
            continue
        current = getattr(athlete, field)
        if current is None or best > current:
            updates[field] = best

    if not updates:
        return

    new_squat = updates.get("squat_max_lbs", athlete.squat_max_lbs)
    new_bench = updates.get("bench_max_lbs", athlete.bench_max_lbs)
    new_deadlift = updates.get("deadlift_max_lbs", athlete.deadlift_max_lbs)
    if None not in (new_squat, new_bench, new_deadlift):
        updates["total_lbs"] = new_squat + new_bench + new_deadlift

    log_max_changes(db, athlete, updates, source="opl", note="OpenPowerlifting import")
    for field, value in updates.items():
        setattr(athlete, field, value)


def _ensure_athlete(db: Session, athlete_id: int) -> Athlete:
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    return athlete


# --- Endpoints ---


@router.get("/search", response_model=OplSearchResponse)
def search(q: str = "", db: Session = Depends(get_db)):
    """Free-text search for an OpenPowerlifting lifter.

    Returns up to 10 candidates with disambiguation context (federation,
    state, last meet date, best total/DOTS) so the coach can pick the
    right person before linking. Empty query returns an empty list
    rather than 422 so the UI can call this on every keystroke.
    """
    q = (q or "").strip()
    if not q:
        return OplSearchResponse(query="", candidates=[])
    try:
        rows = search_lifters(q, limit=10)
    except OplError as e:
        logger.warning("OPL search failed for %r: %s", q, e)
        raise HTTPException(status_code=502, detail="OpenPowerlifting unreachable")
    except Exception as e:
        safe_error(e, "Failed to search OpenPowerlifting", status_code=500)
        return  # unreachable, satisfies type-checker
    return OplSearchResponse(
        query=q,
        candidates=[OplCandidate(**row) for row in rows],
    )


@router.get(
    "/athletes/{athlete_id}/status", response_model=OplStatusResponse
)
def get_status(athlete_id: int, db: Session = Depends(get_db)):
    """Whether the athlete is linked to OpenPowerlifting.

    The actual meet rows live in ``meet_results`` and are read by the
    existing list_meet_results endpoint, so this status payload only
    carries link metadata (slug, last sync, error if any).
    """
    _ensure_athlete(db, athlete_id)
    link = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
    if link is None:
        return OplStatusResponse(linked=False)
    return OplStatusResponse(linked=True, link=_serialize_link(link))


@router.post("/athletes/{athlete_id}/link", response_model=OplLinkResult)
def link(
    athlete_id: int,
    payload: OplLinkRequest,
    db: Session = Depends(get_db),
):
    """Bind an athlete to an OpenPowerlifting slug and import their meets.

    Idempotent: relinking to any slug clears the prior OPL-sourced rows
    and rewrites them from the freshly fetched CSV. Manual rows (if any)
    survive; only ``source='opl'`` rows are touched. The fetch runs
    synchronously because lifter CSVs are tiny (~1 KB) and the coach
    expects results immediately after confirming the match.
    """
    athlete = _ensure_athlete(db, athlete_id)
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")

    try:
        meets = fetch_lifter_csv(slug)
    except OplError as e:
        raise HTTPException(status_code=400, detail=str(e))

    link_row = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
    if link_row is None:
        link_row = OplLink(athlete_id=athlete_id, slug=slug)
        db.add(link_row)
    else:
        link_row.slug = slug

    requested_name = (payload.display_name or "").strip()
    if requested_name:
        link_row.display_name = requested_name
    elif not link_row.display_name:
        link_row.display_name = slug

    imported_attempts = _import_meets_to_meet_results(db, athlete, meets)
    _refresh_athlete_maxes(db, athlete)

    link_row.last_synced_at = datetime.utcnow()
    link_row.last_sync_error = None

    db.commit()
    db.refresh(link_row)

    return OplLinkResult(
        linked=True,
        imported_attempts=imported_attempts,
        link=_serialize_link(link_row),
    )


@router.post("/athletes/{athlete_id}/refresh", response_model=OplLinkResult)
def refresh(athlete_id: int, db: Session = Depends(get_db)):
    """Re-fetch and rewrite OPL-sourced meet_results rows for the athlete."""
    athlete = _ensure_athlete(db, athlete_id)
    link_row = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
    if link_row is None:
        raise HTTPException(status_code=404, detail="Athlete is not linked")

    try:
        meets = fetch_lifter_csv(link_row.slug)
    except OplError as e:
        link_row.last_sync_error = str(e)
        db.commit()
        raise HTTPException(status_code=502, detail=str(e))

    imported_attempts = _import_meets_to_meet_results(db, athlete, meets)
    _refresh_athlete_maxes(db, athlete)

    link_row.last_synced_at = datetime.utcnow()
    link_row.last_sync_error = None
    db.commit()
    db.refresh(link_row)

    return OplLinkResult(
        linked=True,
        imported_attempts=imported_attempts,
        link=_serialize_link(link_row),
    )


@router.delete("/athletes/{athlete_id}/link", status_code=204)
def unlink(athlete_id: int, db: Session = Depends(get_db)):
    """Clear the OpenPowerlifting link and every OPL-sourced meet_results row."""
    _ensure_athlete(db, athlete_id)
    _delete_opl_meet_results(db, athlete_id)
    db.query(OplLink).filter(OplLink.athlete_id == athlete_id).delete(
        synchronize_session=False
    )
    db.commit()
