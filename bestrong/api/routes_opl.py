"""OpenPowerlifting integration endpoints — search, link, refresh, list.

Available in both local and hosted deployments. The OpenPowerlifting
dataset is public domain so there's no per-tenant configuration to
gate behind; the auth middleware already protects these endpoints in
hosted mode at the request level.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models.orm import Athlete, OplLink, OplMeet
from ..opl import OplError, fetch_lifter_csv, search_lifters
from ..opl.client import OPL_BASE
from .deps import get_db
from .error_helpers import safe_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/opl", tags=["openpowerlifting"])


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


class OplMeetResponse(BaseModel):
    id: int
    meet_path: str
    meet_name: str | None
    federation: str | None
    parent_federation: str | None
    meet_date: str | None
    meet_country: str | None
    meet_state: str | None
    event: str | None
    equipment: str | None
    division: str | None
    age_class: str | None
    weight_class_kg: str | None
    bodyweight_kg: float | None
    squat_kg: float | None
    bench_kg: float | None
    deadlift_kg: float | None
    total_kg: float | None
    place: str | None
    dots: float | None
    tested: bool | None


class OplLinkInfo(BaseModel):
    slug: str
    display_name: str | None
    last_synced_at: datetime | None
    last_sync_error: str | None
    profile_url: str


class OplStatusResponse(BaseModel):
    linked: bool
    link: OplLinkInfo | None = None
    meets: list[OplMeetResponse] = []


class OplLinkRequest(BaseModel):
    slug: str
    display_name: str | None = None


class OplLinkResult(BaseModel):
    linked: bool
    imported: int
    link: OplLinkInfo | None = None
    meets: list[OplMeetResponse] = []


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


def _serialize_meet(meet: OplMeet) -> OplMeetResponse:
    return OplMeetResponse(
        id=meet.id,
        meet_path=meet.meet_path,
        meet_name=meet.meet_name,
        federation=meet.federation,
        parent_federation=meet.parent_federation,
        meet_date=meet.meet_date,
        meet_country=meet.meet_country,
        meet_state=meet.meet_state,
        event=meet.event,
        equipment=meet.equipment,
        division=meet.division,
        age_class=meet.age_class,
        weight_class_kg=meet.weight_class_kg,
        bodyweight_kg=meet.bodyweight_kg,
        squat_kg=meet.squat_kg,
        bench_kg=meet.bench_kg,
        deadlift_kg=meet.deadlift_kg,
        total_kg=meet.total_kg,
        place=meet.place,
        dots=meet.dots,
        tested=meet.tested,
    )


def _list_meets(db: Session, athlete_id: int) -> list[OplMeet]:
    return (
        db.query(OplMeet)
        .filter(OplMeet.athlete_id == athlete_id)
        .order_by(OplMeet.meet_date.desc().nullslast(), OplMeet.id.desc())
        .all()
    )


def _import_meets(
    db: Session, athlete_id: int, rows: list[dict[str, Any]]
) -> int:
    """Upsert the supplied meet rows for one athlete, return the count touched.

    Identity is (athlete_id, meet_path). Existing rows are updated in
    place so subsequent refreshes don't double-insert and don't lose
    the row id (UI relies on stable ids for delete/edit affordances).
    """
    if not rows:
        return 0

    existing = {
        m.meet_path: m
        for m in db.query(OplMeet).filter(OplMeet.athlete_id == athlete_id).all()
    }
    fields = (
        "meet_name",
        "meet_date",
        "federation",
        "parent_federation",
        "meet_country",
        "meet_state",
        "event",
        "equipment",
        "division",
        "age_class",
        "weight_class_kg",
        "bodyweight_kg",
        "squat_kg",
        "bench_kg",
        "deadlift_kg",
        "total_kg",
        "place",
        "dots",
        "tested",
    )

    touched = 0
    for row in rows:
        path = row.get("meet_path")
        if not path:
            continue
        meet = existing.get(path)
        if meet is None:
            meet = OplMeet(athlete_id=athlete_id, meet_path=path)
            db.add(meet)
        for field in fields:
            setattr(meet, field, row.get(field))
        touched += 1
    return touched


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
    """Whether the athlete is linked to OpenPowerlifting and what we have on file."""
    _ensure_athlete(db, athlete_id)
    link = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
    if link is None:
        return OplStatusResponse(linked=False)
    return OplStatusResponse(
        linked=True,
        link=_serialize_link(link),
        meets=[_serialize_meet(m) for m in _list_meets(db, athlete_id)],
    )


@router.post("/athletes/{athlete_id}/link", response_model=OplLinkResult)
def link(
    athlete_id: int,
    payload: OplLinkRequest,
    db: Session = Depends(get_db),
):
    """Bind an athlete to an OpenPowerlifting slug and import their meets.

    Idempotent: relinking to the same slug refreshes the cache; relinking
    to a different slug clears the previous athlete's meet rows first
    so the displayed history matches the now-linked profile. The fetch
    runs synchronously: lifter CSVs are tiny (~1 KB) and the coach
    expects to see results immediately after confirming the match.
    """
    _ensure_athlete(db, athlete_id)
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")

    try:
        rows = fetch_lifter_csv(slug)
    except OplError as e:
        raise HTTPException(status_code=400, detail=str(e))

    link_row = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
    if link_row is None:
        link_row = OplLink(athlete_id=athlete_id, slug=slug)
        db.add(link_row)
    elif link_row.slug != slug:
        db.query(OplMeet).filter(OplMeet.athlete_id == athlete_id).delete(
            synchronize_session=False
        )
        link_row.slug = slug

    requested_name = (payload.display_name or "").strip()
    if requested_name:
        link_row.display_name = requested_name
    elif not link_row.display_name:
        link_row.display_name = slug

    imported = _import_meets(db, athlete_id, rows)
    link_row.last_synced_at = datetime.utcnow()
    link_row.last_sync_error = None

    db.commit()
    db.refresh(link_row)

    return OplLinkResult(
        linked=True,
        imported=imported,
        link=_serialize_link(link_row),
        meets=[_serialize_meet(m) for m in _list_meets(db, athlete_id)],
    )


@router.post("/athletes/{athlete_id}/refresh", response_model=OplLinkResult)
def refresh(athlete_id: int, db: Session = Depends(get_db)):
    """Re-fetch and upsert meet rows for an already-linked athlete."""
    _ensure_athlete(db, athlete_id)
    link_row = db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
    if link_row is None:
        raise HTTPException(status_code=404, detail="Athlete is not linked")

    try:
        rows = fetch_lifter_csv(link_row.slug)
    except OplError as e:
        link_row.last_sync_error = str(e)
        db.commit()
        raise HTTPException(status_code=502, detail=str(e))

    imported = _import_meets(db, athlete_id, rows)
    link_row.last_synced_at = datetime.utcnow()
    link_row.last_sync_error = None
    db.commit()
    db.refresh(link_row)

    return OplLinkResult(
        linked=True,
        imported=imported,
        link=_serialize_link(link_row),
        meets=[_serialize_meet(m) for m in _list_meets(db, athlete_id)],
    )


@router.delete("/athletes/{athlete_id}/link", status_code=204)
def unlink(athlete_id: int, db: Session = Depends(get_db)):
    """Clear the OpenPowerlifting link and every imported meet for the athlete."""
    _ensure_athlete(db, athlete_id)
    db.query(OplMeet).filter(OplMeet.athlete_id == athlete_id).delete(
        synchronize_session=False
    )
    db.query(OplLink).filter(OplLink.athlete_id == athlete_id).delete(
        synchronize_session=False
    )
    db.commit()
