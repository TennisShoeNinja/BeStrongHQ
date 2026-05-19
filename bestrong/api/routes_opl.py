"""OpenPowerlifting integration endpoints: search, link, refresh, unlink.

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
from ..opl.autolink import run_opl_autolink
from ..opl.client import OPL_BASE
from ..services.max_tracking import reconcile_competition_maxes, sync_competition_lane_prs
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
    not_applicable: bool = False


class OplLinkRequest(BaseModel):
    slug: str
    display_name: str | None = None


class OplNotApplicableRequest(BaseModel):
    value: bool


class OplLinkResult(BaseModel):
    linked: bool
    imported_attempts: int
    link: OplLinkInfo | None = None


class OplAutolinkLinked(BaseModel):
    athlete_id: int
    name: str
    slug: str
    imported_attempts: int


class OplAutolinkNeedsReview(BaseModel):
    athlete_id: int
    name: str
    candidates: list[OplCandidate]


class OplAutolinkNoMatch(BaseModel):
    athlete_id: int
    name: str


class OplAutolinkResponse(BaseModel):
    linked: list[OplAutolinkLinked]
    needs_review: list[OplAutolinkNeedsReview]
    no_match: list[OplAutolinkNoMatch]


class OplCoverageAthlete(BaseModel):
    athlete_id: int
    name: str


class OplCoverageResponse(BaseModel):
    linked: int
    needs_linking: int
    not_applicable: int
    total: int
    needs_linking_athletes: list[OplCoverageAthlete]


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

    from ..scoring import gl_points

    # Backfill athlete.sex from OPL data if it's missing locally. Coaches
    # rarely fill the sex field on profile creation but OPL always has it,
    # and we need it to compute IPF GL Points.
    if not athlete.sex:
        for meet in meets:
            meet_sex = meet.get("sex")
            if meet_sex:
                athlete.sex = meet_sex
                break
    dated_meets = [meet for meet in meets if meet.get("meet_date")]
    if dated_meets:
        most_recent_meet = max(
            dated_meets, key=lambda meet: str(meet.get("meet_date"))
        )
        if not athlete.division:
            division = most_recent_meet.get("division")
            if division:
                athlete.division = division
        if not athlete.weight_class:
            weight_class_kg = most_recent_meet.get("weight_class_kg")
            if weight_class_kg:
                athlete.weight_class = f"{weight_class_kg} kg"

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
        bodyweight_kg = meet.get("bodyweight_kg")
        dots_score = meet.get("dots")
        total_kg = meet.get("total_kg")
        equipment = meet.get("equipment")
        place = meet.get("place")
        gl = gl_points(total_kg, bodyweight_kg, athlete.sex, equipment)
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
                    bodyweight_kg=bodyweight_kg,
                    dots_score=dots_score,
                    gl_points=gl,
                    place=place,
                )
            )
            written += 1
    return written


def _refresh_athlete_maxes(db: Session, athlete: Athlete) -> None:
    """Reconcile cached competition maxes with current evidence.

    Recompute uses every remaining MeetResult plus non-meet MaxHistory
    rows (training PRs from imports, manual coach edits) and the
    declared baseline. Routine flows only add evidence so the cached
    max only rises in the common case; demotions happen when OPL
    retires a meet and no other source supports the previous peak.

    Also keeps the per-exercise comp PR lane in sync with the imported
    meet results so the athlete-profile progression modal shows OPL
    bests alongside training entries.
    """
    reconcile_competition_maxes(
        db, athlete, source="opl", note="OpenPowerlifting import"
    )
    sync_competition_lane_prs(db, athlete.id, source="opl")


def _ensure_athlete(db: Session, athlete_id: int) -> Athlete:
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    return athlete


def _status_response(db: Session, athlete: Athlete) -> OplStatusResponse:
    link = db.query(OplLink).filter(OplLink.athlete_id == athlete.id).first()
    return OplStatusResponse(
        linked=link is not None,
        link=_serialize_link(link) if link is not None else None,
        not_applicable=bool(athlete.opl_not_applicable),
    )


def _perform_link(
    db: Session,
    athlete: Athlete,
    slug: str,
    display_name: str | None = None,
) -> int:
    meets = fetch_lifter_csv(slug)

    link_row = db.query(OplLink).filter(OplLink.athlete_id == athlete.id).first()
    if link_row is None:
        link_row = OplLink(athlete_id=athlete.id, slug=slug)
        db.add(link_row)
    else:
        link_row.slug = slug

    requested_name = (display_name or "").strip()
    if requested_name:
        link_row.display_name = requested_name
    elif not link_row.display_name:
        link_row.display_name = slug

    imported_attempts = _import_meets_to_meet_results(db, athlete, meets)
    _refresh_athlete_maxes(db, athlete)

    link_row.last_synced_at = datetime.utcnow()
    link_row.last_sync_error = None
    return imported_attempts


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


@router.get("/coverage", response_model=OplCoverageResponse)
def coverage(db: Session = Depends(get_db)):
    """Return DB-only OpenPowerlifting roster coverage for active athletes."""
    linked = (
        db.query(Athlete.id)
        .join(OplLink, OplLink.athlete_id == Athlete.id)
        .filter(Athlete.archived == 0)
        .count()
    )
    not_applicable = (
        db.query(Athlete.id)
        .outerjoin(OplLink, OplLink.athlete_id == Athlete.id)
        .filter(Athlete.archived == 0)
        .filter(OplLink.id.is_(None))
        .filter(Athlete.opl_not_applicable == 1)
        .count()
    )
    needs_linking_rows = (
        db.query(Athlete.id, Athlete.name)
        .outerjoin(OplLink, OplLink.athlete_id == Athlete.id)
        .filter(Athlete.archived == 0)
        .filter(OplLink.id.is_(None))
        .filter(Athlete.opl_not_applicable == 0)
        .order_by(Athlete.name)
        .all()
    )
    needs_linking = len(needs_linking_rows)
    return OplCoverageResponse(
        linked=linked,
        needs_linking=needs_linking,
        not_applicable=not_applicable,
        total=linked + needs_linking + not_applicable,
        needs_linking_athletes=[
            OplCoverageAthlete(athlete_id=row.id, name=row.name)
            for row in needs_linking_rows
        ],
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
    athlete = _ensure_athlete(db, athlete_id)
    return _status_response(db, athlete)


@router.put(
    "/athletes/{athlete_id}/not-applicable",
    response_model=OplStatusResponse,
)
def set_not_applicable(
    athlete_id: int,
    payload: OplNotApplicableRequest,
    db: Session = Depends(get_db),
):
    athlete = _ensure_athlete(db, athlete_id)
    link = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
    if payload.value and link is not None:
        raise HTTPException(
            status_code=409,
            detail="Unlink from OpenPowerlifting first",
        )

    athlete.opl_not_applicable = 1 if payload.value else 0
    db.commit()
    db.refresh(athlete)
    return OplStatusResponse(
        linked=link is not None,
        link=_serialize_link(link) if link is not None else None,
        not_applicable=bool(athlete.opl_not_applicable),
    )


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
        imported_attempts = _perform_link(
            db,
            athlete,
            slug,
            display_name=payload.display_name,
        )
    except OplError as e:
        raise HTTPException(status_code=400, detail=str(e))

    link_row = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()

    db.commit()
    db.refresh(link_row)

    return OplLinkResult(
        linked=True,
        imported_attempts=imported_attempts,
        link=_serialize_link(link_row),
    )


@router.post("/autolink", response_model=OplAutolinkResponse)
def autolink(db: Session = Depends(get_db)):
    """Auto-link athletes that have one clear OpenPowerlifting match."""
    return run_opl_autolink(db)


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
