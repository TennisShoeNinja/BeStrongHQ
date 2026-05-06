"""CRUD for athlete meet results and derived competition maxes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.orm import Athlete, Meet, MeetResult
from ..services.max_tracking import log_max_changes, sync_competition_lane_prs
from .deps import get_db
from .schemas import (
    CompetitionMaxForLift,
    MeetResultEntry,
    MeetResultsWrite,
)

router = APIRouter(prefix="/api", tags=["meet-results"])

_COMPETITION_LIFTS = ("squat", "bench", "deadlift")
_MAX_FIELD_BY_LIFT = {
    "squat": "squat_max_lbs",
    "bench": "bench_max_lbs",
    "deadlift": "deadlift_max_lbs",
}


def _hydrate_meet_context(db: Session, payload: MeetResultsWrite) -> dict:
    """Resolve the denormalized meet metadata for a write.

    If ``meet_id`` is set, prefer live Meet fields over any values in the
    payload — coaches shouldn't be able to accidentally overwrite the
    canonical Meet name by typing a different one in the modal. If no
    ``meet_id``, use the payload values as-is.
    """
    ctx = {
        "meet_id": payload.meet_id,
        "meet_name": payload.meet_name,
        "meet_date": payload.meet_date,
        "federation": payload.federation,
        "weight_class": payload.weight_class,
        "division": payload.division,
    }
    if payload.meet_id:
        meet = db.query(Meet).filter(Meet.id == payload.meet_id).first()
        if meet is None:
            raise HTTPException(status_code=404, detail="Meet not found")
        ctx["meet_name"] = meet.name


        ctx["meet_date"] = payload.meet_date or meet.meet_date
        ctx["federation"] = meet.federation
    return ctx


@router.post("/athletes/{athlete_id}/meet-results", response_model=list[MeetResultEntry])
def save_meet_results(
    athlete_id: int,
    payload: MeetResultsWrite,
    db: Session = Depends(get_db),
):
    """Log a set of meet attempts in one call.

    Any attempt with a null ``weight_lbs`` is skipped — lets the Log Meet
    Results modal post the full 3×3 grid and have blanks ignored. Set
    ``replace_existing`` to clear prior rows for this (athlete, meet)
    before writing; useful for re-submits from the modal.
    """
    if payload.athlete_id != athlete_id:
        raise HTTPException(status_code=400, detail="athlete_id in path must match body")
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    ctx = _hydrate_meet_context(db, payload)

    if not ctx["meet_id"] and not (ctx["meet_name"] and ctx["meet_date"]):
        raise HTTPException(
            status_code=400,
            detail="Provide meet_id, or both meet_name and meet_date",
        )

    if payload.replace_existing:
        q = db.query(MeetResult).filter(MeetResult.athlete_id == athlete_id)
        if ctx["meet_id"] is not None:
            q = q.filter(MeetResult.meet_id == ctx["meet_id"])
        else:

            q = q.filter(
                MeetResult.meet_id.is_(None),
                MeetResult.meet_name == ctx["meet_name"],
                MeetResult.meet_date == ctx["meet_date"],
            )
        q.delete(synchronize_session=False)

    created: list[MeetResult] = []
    meet_bests: dict[str, float] = {}
    for attempt in payload.attempts:
        if attempt.weight_lbs is None:
            continue
        if attempt.lift not in _COMPETITION_LIFTS:
            raise HTTPException(
                status_code=400, detail=f"Invalid lift: {attempt.lift}"
            )
        if attempt.attempt_number not in (1, 2, 3):
            raise HTTPException(
                status_code=400, detail="attempt_number must be 1, 2, or 3"
            )
        row = MeetResult(
            athlete_id=athlete_id,
            meet_id=ctx["meet_id"],
            meet_name=ctx["meet_name"],
            meet_date=ctx["meet_date"],
            federation=ctx["federation"],
            weight_class=ctx["weight_class"] or athlete.weight_class,
            division=ctx["division"] or athlete.division,
            lift=attempt.lift,
            attempt_number=attempt.attempt_number,
            weight_lbs=attempt.weight_lbs,
            made=attempt.made,
            notes=attempt.notes,
        )
        db.add(row)
        created.append(row)
        if attempt.made:
            cur_best = meet_bests.get(attempt.lift)
            if cur_best is None or attempt.weight_lbs > cur_best:
                meet_bests[attempt.lift] = attempt.weight_lbs


    if created:


        matches_by_id = (
            ctx["meet_id"] is not None
            and athlete.next_meet_id is not None
            and athlete.next_meet_id == ctx["meet_id"]
        )
        matches_by_name = (
            bool(athlete.next_meet_name)
            and bool(ctx["meet_name"])
            and athlete.next_meet_name == ctx["meet_name"]
        )
        matches_by_date = (
            bool(athlete.meet_date)
            and bool(ctx["meet_date"])
            and athlete.meet_date == ctx["meet_date"]
        )
        is_current_next_meet = matches_by_id or matches_by_name or matches_by_date
        if is_current_next_meet:
            athlete.next_meet_id = None
            athlete.next_meet_name = None
            athlete.meet_date = None
            athlete.weeks_out = None
            athlete.days_out = None


    max_updates: dict[str, float] = {}
    for lift, best_weight in meet_bests.items():
        field = _MAX_FIELD_BY_LIFT[lift]
        current = getattr(athlete, field)
        if current is None or best_weight > current:
            max_updates[field] = best_weight
    if max_updates:
        new_squat = max_updates.get("squat_max_lbs", athlete.squat_max_lbs)
        new_bench = max_updates.get("bench_max_lbs", athlete.bench_max_lbs)
        new_deadlift = max_updates.get("deadlift_max_lbs", athlete.deadlift_max_lbs)
        if None not in (new_squat, new_bench, new_deadlift):
            max_updates["total_lbs"] = new_squat + new_bench + new_deadlift
        log_max_changes(
            db, athlete, max_updates, source="meet", note=ctx["meet_name"]
        )
        for field, value in max_updates.items():
            setattr(athlete, field, value)

    if created:
        db.flush()
        sync_competition_lane_prs(db, athlete_id, source="meet")

    db.commit()
    for row in created:
        db.refresh(row)
    return created


@router.get("/athletes/{athlete_id}/meet-results", response_model=list[MeetResultEntry])
def list_meet_results(athlete_id: int, db: Session = Depends(get_db)):
    """All logged meet attempts for an athlete, newest meet first."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    return (
        db.query(MeetResult)
        .filter(MeetResult.athlete_id == athlete_id)
        .order_by(
            MeetResult.meet_date.desc().nullslast(),
            MeetResult.lift,
            MeetResult.attempt_number,
        )
        .all()
    )


@router.get(
    "/athletes/{athlete_id}/competition-maxes",
    response_model=list[CompetitionMaxForLift],
)
def get_competition_maxes(athlete_id: int, db: Session = Depends(get_db)):
    """Best made attempt per lift across every meet the athlete has on record.

    Returns one entry per competition lift. ``weight_lbs`` is null when no
    made attempt exists for that lift — lets the UI render a "no comp
    data" placeholder rather than hiding the row, so coaches can see which
    lifts still need results logged.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    rows = (
        db.query(MeetResult)
        .filter(MeetResult.athlete_id == athlete_id, MeetResult.made.is_(True))
        .all()
    )

    best: dict[str, MeetResult] = {}
    for r in rows:
        cur = best.get(r.lift)
        if cur is None or r.weight_lbs > cur.weight_lbs:
            best[r.lift] = r

    out: list[CompetitionMaxForLift] = []
    for lift in _COMPETITION_LIFTS:
        r = best.get(lift)
        if r is None:
            out.append(CompetitionMaxForLift(lift=lift))
        else:
            out.append(
                CompetitionMaxForLift(
                    lift=lift,
                    weight_lbs=r.weight_lbs,
                    meet_id=r.meet_id,
                    meet_name=r.meet_name,
                    meet_date=r.meet_date,
                    federation=r.federation,
                    weight_class=r.weight_class,
                )
            )
    return out


@router.delete("/meet-results/{result_id}", status_code=204)
def delete_meet_result(result_id: int, db: Session = Depends(get_db)):
    row = db.query(MeetResult).filter(MeetResult.id == result_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Meet result not found")
    db.delete(row)
    db.commit()
