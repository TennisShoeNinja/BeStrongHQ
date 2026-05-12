"""Dashboard summary routes."""

from __future__ import annotations

from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.orm import Athlete, GDriveImport, Program
from .deps import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class TodayStatusResponse(BaseModel):
    """Minimal honest v1 for the dashboard's training-today summary.

    roster_total - count(athletes where archived = false) for the current instance.
    scheduled_today - count(non-archived athletes where today's ISO weekday matches any
    of primary_squat_day / primary_bench_day / primary_deadlift_day). Today's weekday is
    computed from the request-time datetime.now() server-side (no client timezone yet,
    see follow-up). Athletes whose primary days are all NULL are excluded.
    with_active_program - count(non-archived athletes with at least one program where
    date_end >= today). date_end is a String(20) in YYYY-MM-DD form; compare
    lexicographically against date.today().isoformat().
    synced_today - count(distinct athlete_id from gdrive_imports where imported_at >=
    today_start_utc). This is the proxy for "fresh activity"; a coach syncing today is
    the closest signal we have to athletes-have-new-data without a per-entry timestamp.
    computed_at - server now, UTC, ISO-8601 with Z. Used by the frontend to show
    "synced N min ago" if/when we add a freshness pill.
    """

    roster_total: int
    scheduled_today: int
    with_active_program: int
    synced_today: int
    computed_at: str


@router.get("/today-status", response_model=TodayStatusResponse)
def today_status(db: Session = Depends(get_db)):
    now_utc = datetime.now(UTC)
    today_iso = date.today().isoformat()
    today_weekday = datetime.now().date().isoweekday()
    today_start_utc = datetime.combine(now_utc.date(), time.min)

    active_athletes = Athlete.archived == False  # noqa: E712

    roster_total = db.query(Athlete).filter(active_athletes).count()
    scheduled_today = (
        db.query(Athlete)
        .filter(active_athletes)
        .filter(
            or_(
                Athlete.primary_squat_day == today_weekday,
                Athlete.primary_bench_day == today_weekday,
                Athlete.primary_deadlift_day == today_weekday,
            )
        )
        .count()
    )
    with_active_program = (
        db.query(func.count(func.distinct(Athlete.id)))
        .join(Program, Program.athlete_id == Athlete.id)
        .filter(active_athletes)
        .filter(Program.date_end >= today_iso)
        .scalar()
        or 0
    )
    synced_today = (
        db.query(func.count(func.distinct(Program.athlete_id)))
        .join(GDriveImport, GDriveImport.program_id == Program.id)
        .filter(GDriveImport.imported_at >= today_start_utc)
        .scalar()
        or 0
    )

    return TodayStatusResponse(
        roster_total=roster_total,
        scheduled_today=scheduled_today,
        with_active_program=with_active_program,
        synced_today=synced_today,
        computed_at=now_utc.isoformat().replace("+00:00", "Z"),
    )
