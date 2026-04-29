"""Wellness / body metrics endpoints — nutrition tracking and bodyweight trends."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..models.orm import Athlete, DailyWellness
from .deps import get_db
from .schemas import (
    WellnessDataPoint,
    WellnessResponse,
    WellnessSummary,
)

router = APIRouter(prefix="/api/wellness", tags=["wellness"])


def _build_summary(entries: list[DailyWellness]) -> WellnessSummary:
    """Compute aggregated wellness stats from a list of DailyWellness rows."""
    from datetime import date, datetime, timedelta

    total = len(entries)
    today = datetime.now().date()

    cal_actuals = [e.actual_calories for e in entries if e.actual_calories is not None]
    cal_goals = [e.goal_calories for e in entries if e.goal_calories is not None]
    protein_actuals = [e.actual_protein for e in entries if e.actual_protein is not None]
    carbs_actuals = [e.actual_carbs for e in entries if e.actual_carbs is not None]
    fat_actuals = [e.actual_fat for e in entries if e.actual_fat is not None]


    bw_entries = sorted(
        [
            (e.date or "", e.bodyweight_lbs, e.program_id)
            for e in entries
            if e.bodyweight_lbs is not None
        ],
        key=lambda x: x[0],
    )

    latest_bw = None
    latest_bw_date = None
    if bw_entries:
        latest_bw = round(bw_entries[-1][1], 1)
        latest_bw_date = bw_entries[-1][0] or None


    starting_bw = None
    starting_bw_date = None
    if bw_entries:
        starting_bw = round(bw_entries[0][1], 1)
        starting_bw_date = bw_entries[0][0] or None


    starting_bw_program = None
    starting_bw_program_date = None
    if bw_entries:
        current_pid = bw_entries[-1][2]
        if current_pid is not None:
            program_bw = [e for e in bw_entries if e[2] == current_pid]
            if program_bw:
                starting_bw_program = round(program_bw[0][1], 1)
                starting_bw_program_date = program_bw[0][0] or None


    bw_change = None
    if len(bw_entries) >= 2:
        bw_change = round(bw_entries[-1][1] - bw_entries[0][1], 1)


    min_bw = None
    min_bw_date = None
    if bw_entries:
        lowest = min(bw_entries, key=lambda x: x[1])
        min_bw = round(lowest[1], 1)
        min_bw_date = lowest[0] or None


    change_30d = None
    if len(bw_entries) >= 2:
        target = today - timedelta(days=30)
        window_start = (today - timedelta(days=45)).isoformat()
        window_end = (today - timedelta(days=15)).isoformat()
        candidates = [
            e for e in bw_entries if e[0] and window_start <= e[0] <= window_end
        ]
        if candidates:
            anchor = min(
                candidates,
                key=lambda e: abs((date.fromisoformat(e[0]) - target).days),
            )
            change_30d = round(bw_entries[-1][1] - anchor[1], 1)


    avg_bw_this_week = None
    avg_bw_last_week = None
    if bw_entries:
        this_monday = today - timedelta(days=today.weekday())
        last_monday = this_monday - timedelta(days=7)
        this_monday_str = this_monday.isoformat()
        last_monday_str = last_monday.isoformat()
        next_monday_str = (this_monday + timedelta(days=7)).isoformat()

        this_week_bw = [e[1] for e in bw_entries if this_monday_str <= e[0] < next_monday_str]
        last_week_bw = [e[1] for e in bw_entries if last_monday_str <= e[0] < this_monday_str]

        if this_week_bw:
            avg_bw_this_week = round(sum(this_week_bw) / len(this_week_bw), 1)
        if last_week_bw:
            avg_bw_last_week = round(sum(last_week_bw) / len(last_week_bw), 1)

    avg_actual_cal = round(sum(cal_actuals) / len(cal_actuals), 0) if cal_actuals else None
    avg_goal_cal = round(sum(cal_goals) / len(cal_goals), 0) if cal_goals else None
    avg_protein = round(sum(protein_actuals) / len(protein_actuals), 0) if protein_actuals else None
    avg_carbs = round(sum(carbs_actuals) / len(carbs_actuals), 0) if carbs_actuals else None
    avg_fat = round(sum(fat_actuals) / len(fat_actuals), 0) if fat_actuals else None


    compliance = None
    if total > 0:
        compliance = round((len(cal_actuals) / total) * 100, 1)

    return WellnessSummary(
        total_entries=total,
        entries_with_calories=len(cal_actuals),
        min_bodyweight=min_bw,
        min_bodyweight_date=min_bw_date,
        latest_bodyweight=latest_bw,
        latest_bodyweight_date=latest_bw_date,
        starting_bodyweight=starting_bw,
        starting_bodyweight_date=starting_bw_date,
        starting_bodyweight_program=starting_bw_program,
        starting_bodyweight_program_date=starting_bw_program_date,
        bodyweight_change=bw_change,
        change_30d=change_30d,
        avg_bw_this_week=avg_bw_this_week,
        avg_bw_last_week=avg_bw_last_week,
        avg_actual_calories=avg_actual_cal,
        avg_actual_protein=avg_protein,
        avg_actual_carbs=avg_carbs,
        avg_actual_fat=avg_fat,
        avg_goal_calories=avg_goal_cal,
        calorie_compliance_pct=compliance,
    )


@router.get("/athletes/{athlete_id}", response_model=WellnessResponse)
def get_athlete_wellness(
    athlete_id: int,
    program_id: int | None = Query(None, description="Filter to a single program"),
    db: Session = Depends(get_db),
):
    """Get wellness data (nutrition + bodyweight) for an athlete.

    Returns all daily wellness entries with a computed summary.
    Optionally filter to a single program.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    q = db.query(DailyWellness).filter(DailyWellness.athlete_id == athlete_id)

    if program_id:
        q = q.filter(DailyWellness.program_id == program_id)

    q = q.order_by(DailyWellness.date, DailyWellness.week_number)
    entries = q.all()

    summary = _build_summary(entries)

    data_points = [
        WellnessDataPoint(
            id=e.id,
            date=e.date,
            week_number=e.week_number,
            day_of_week=e.day_of_week,
            goal_calories=e.goal_calories,
            goal_protein=e.goal_protein,
            goal_carbs=e.goal_carbs,
            goal_fat=e.goal_fat,
            actual_calories=e.actual_calories,
            actual_protein=e.actual_protein,
            actual_carbs=e.actual_carbs,
            actual_fat=e.actual_fat,
            bodyweight_lbs=e.bodyweight_lbs,
        )
        for e in entries
    ]

    return WellnessResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.name,
        program_id=program_id,
        summary=summary,
        data=data_points,
    )


@router.get("/athletes/{athlete_id}/bodyweight", response_model=list[dict])
def get_bodyweight_trend(
    athlete_id: int,
    program_id: int | None = Query(None, description="Filter to a single program"),
    db: Session = Depends(get_db),
):
    """Get bodyweight trend data for charting.

    Returns only entries where bodyweight was recorded, sorted by date.
    Optimized for feeding directly into a line chart.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    q = (
        db.query(DailyWellness)
        .filter(DailyWellness.athlete_id == athlete_id)
        .filter(DailyWellness.bodyweight_lbs.isnot(None))
    )

    if program_id:
        q = q.filter(DailyWellness.program_id == program_id)

    q = q.order_by(DailyWellness.date)
    entries = q.all()

    return [
        {
            "date": e.date,
            "bodyweight_lbs": e.bodyweight_lbs,
            "week_number": e.week_number,
            "day_of_week": e.day_of_week,
        }
        for e in entries
    ]
