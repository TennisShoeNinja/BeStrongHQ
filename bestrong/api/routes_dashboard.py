"""Dashboard summary routes."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session as OrmSession

from ..models.orm import (
    Athlete,
    GDriveImport,
    MaxHistory,
    Notification,
    Program,
)
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


class WeeklyStatsResponse(BaseModel):
    """8-week sparkline + delta summary for the mobile home stat strip."""

    prs_this_week: int
    prs_delta: int
    prs_spark: list[int]
    sessions_this_week: int
    sessions_spark: list[int]
    flagged_now: int
    flagged_delta: int
    flagged_spark: list[int]


class NeedsReviewItem(BaseModel):
    id: str
    kind: str
    athlete_id: int
    athlete_name: str
    athlete_initials: str
    avatar_class: str
    title: str
    occurred_at: str
    target_id: int | None = None


class TodayScheduleAthlete(BaseModel):
    id: int
    name: str


class TodayScheduleItem(BaseModel):
    time_label: str
    title: str
    athlete_count: int
    kind: str
    athletes: list[TodayScheduleAthlete]


@router.get("/today-status", response_model=TodayStatusResponse)
def today_status(db: OrmSession = Depends(get_db)):
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


@router.get("/weekly-stats", response_model=WeeklyStatsResponse)
def weekly_stats(db: OrmSession = Depends(get_db)):
    now = datetime.now()

    def week_bounds(weeks_ago: int) -> tuple[datetime, datetime]:
        end = now - timedelta(days=7 * weeks_ago)
        start = end - timedelta(days=7)
        return start, end

    pr_filter = MaxHistory.new_value > MaxHistory.old_value

    prs_spark: list[int] = []
    for i in range(7, -1, -1):
        start, end = week_bounds(i)
        count = (
            db.query(func.count(MaxHistory.id))
            .filter(pr_filter)
            .filter(MaxHistory.recorded_at >= start)
            .filter(MaxHistory.recorded_at < end)
            .scalar()
            or 0
        )
        prs_spark.append(count)
    prs_this_week = prs_spark[-1]
    prs_prior_week = prs_spark[-2] if len(prs_spark) >= 2 else 0
    prs_delta = prs_this_week - prs_prior_week

    sessions_spark: list[int] = []
    for i in range(7, -1, -1):
        start, end = week_bounds(i)
        count = (
            db.query(func.count(Program.id))
            .filter(Program.imported_at >= start)
            .filter(Program.imported_at < end)
            .scalar()
            or 0
        )
        sessions_spark.append(count)
    sessions_this_week = sessions_spark[-1]

    flagged_now = (
        db.query(func.count(Notification.id))
        .filter(Notification.archived == False)  # noqa: E712
        .scalar()
        or 0
    )
    prior_week_start, prior_week_end = week_bounds(0)
    archived_this_week = (
        db.query(func.count(Notification.id))
        .filter(Notification.archived == True)  # noqa: E712
        .filter(Notification.created_at >= prior_week_start)
        .filter(Notification.created_at < prior_week_end)
        .scalar()
        or 0
    )
    flagged_delta = flagged_now - archived_this_week
    # TODO: reconstruct historical flagged trend (open-count at start of each week).
    flagged_spark = [0, 0, 0, 0, 0, 0, 0, flagged_now]

    return WeeklyStatsResponse(
        prs_this_week=prs_this_week,
        prs_delta=prs_delta,
        prs_spark=prs_spark,
        sessions_this_week=sessions_this_week,
        sessions_spark=sessions_spark,
        flagged_now=flagged_now,
        flagged_delta=flagged_delta,
        flagged_spark=flagged_spark,
    )


def _initials(name: str) -> str:
    parts = [p for p in name.strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _avatar_class(athlete_id: int) -> str:
    return f"cloud-av-{(athlete_id % 6) + 1}"


def _iso_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


@router.get("/needs-review", response_model=list[NeedsReviewItem])
def needs_review(
    limit: int = Query(default=3, ge=1, le=20),
    db: OrmSession = Depends(get_db),
):
    now = datetime.now()
    pr_cutoff = now - timedelta(days=30)

    pr_rows = (
        db.query(MaxHistory, Athlete)
        .join(Athlete, Athlete.id == MaxHistory.athlete_id)
        .filter(MaxHistory.new_value > MaxHistory.old_value)
        .filter(MaxHistory.recorded_at >= pr_cutoff)
        .filter(Athlete.archived == False)  # noqa: E712
        .order_by(MaxHistory.recorded_at.desc())
        .limit(limit * 4)
        .all()
    )
    items: list[NeedsReviewItem] = []
    for mh, athlete in pr_rows:
        weight_str = f"{int(mh.new_value)}" if float(mh.new_value).is_integer() else f"{mh.new_value:g}"
        reps_part = f" × {mh.reps}" if mh.reps else ""
        title = f"{mh.lift.capitalize()} {weight_str}lbs{reps_part} · new PR"
        items.append(
            NeedsReviewItem(
                id=f"pr-{mh.id}",
                kind="pr",
                athlete_id=athlete.id,
                athlete_name=athlete.name,
                athlete_initials=_initials(athlete.name),
                avatar_class=_avatar_class(athlete.id),
                title=title,
                occurred_at=_iso_z(mh.recorded_at),
                target_id=mh.id,
            )
        )

    return items[:limit]


@router.get("/today-schedule", response_model=list[TodayScheduleItem])
def today_schedule(db: OrmSession = Depends(get_db)):
    today_weekday = datetime.now().date().isoweekday()
    active_athletes = Athlete.archived == False  # noqa: E712

    squat_athletes = (
        db.query(Athlete)
        .filter(active_athletes)
        .filter(Athlete.primary_squat_day == today_weekday)
        .order_by(Athlete.name.asc())
        .all()
    )
    bench_athletes = (
        db.query(Athlete)
        .filter(active_athletes)
        .filter(Athlete.primary_bench_day == today_weekday)
        .order_by(Athlete.name.asc())
        .all()
    )
    deadlift_athletes = (
        db.query(Athlete)
        .filter(active_athletes)
        .filter(Athlete.primary_deadlift_day == today_weekday)
        .order_by(Athlete.name.asc())
        .all()
    )

    if not squat_athletes and not bench_athletes and not deadlift_athletes:
        return []

    def athlete_items(rows: list[Athlete]) -> list[TodayScheduleAthlete]:
        return [TodayScheduleAthlete(id=row.id, name=row.name) for row in rows]

    buckets: list[TodayScheduleItem] = []
    if squat_athletes:
        buckets.append(
            TodayScheduleItem(
                time_label="",
                title="Squat day",
                athlete_count=len(squat_athletes),
                kind="individual" if len(squat_athletes) == 1 else "group",
                athletes=athlete_items(squat_athletes),
            )
        )
    if bench_athletes:
        buckets.append(
            TodayScheduleItem(
                time_label="",
                title="Bench day",
                athlete_count=len(bench_athletes),
                kind="individual" if len(bench_athletes) == 1 else "group",
                athletes=athlete_items(bench_athletes),
            )
        )
    if deadlift_athletes:
        buckets.append(
            TodayScheduleItem(
                time_label="",
                title="Deadlift day",
                athlete_count=len(deadlift_athletes),
                kind="individual" if len(deadlift_athletes) == 1 else "group",
                athletes=athlete_items(deadlift_athletes),
            )
        )
    return buckets
