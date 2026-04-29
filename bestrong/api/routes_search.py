"""Global search — athletes and meets — for the topbar search bar."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..models.orm import Athlete, Meet
from .deps import get_db
from .schemas import (
    SearchAthleteHit,
    SearchMeetHit,
    SearchResponse,
)

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResponse)
def search(
    q: str = Query("", description="Query string; returns empty results if blank"),
    limit: int = Query(8, ge=1, le=25),
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Search athletes and meets by substring match.

    Case-insensitive LIKE match. Kept intentionally simple — there's no
    ranking layer, results are ordered by each entity's natural order
    (athlete alphabetical, meet date-desc). Front-end limits each bucket
    to ``limit`` rows to keep the dropdown tight.
    """
    term = q.strip()
    if not term:
        return SearchResponse(athletes=[], meets=[])
    pattern = f"%{term}%"

    athletes_q = db.query(Athlete).filter(Athlete.name.ilike(pattern))
    if not include_archived:
        athletes_q = athletes_q.filter(Athlete.archived == False)  # noqa: E712
    athlete_rows = athletes_q.order_by(Athlete.name).limit(limit).all()

    meet_rows = (
        db.query(Meet)
        .filter(Meet.name.ilike(pattern))
        .order_by(Meet.meet_date.desc().nullslast())
        .limit(limit)
        .all()
    )

    return SearchResponse(
        athletes=[SearchAthleteHit(id=a.id, name=a.name) for a in athlete_rows],
        meets=[
            SearchMeetHit(
                id=m.id,
                name=m.name,
                meet_date=m.meet_date,
                federation=m.federation,
            )
            for m in meet_rows
        ],
    )
