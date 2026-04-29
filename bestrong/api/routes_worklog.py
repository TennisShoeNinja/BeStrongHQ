"""Work log routes for tracking time spent on athlete programs."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.orm import Athlete, WorkLog
from .deps import get_db
from .schemas import WorkLogCreate, WorkLogResponse, WorkLogStats

router = APIRouter(prefix="/api/work-logs", tags=["work-logs"])


@router.post("", response_model=WorkLogResponse)
def create_work_log(body: WorkLogCreate, db: Session = Depends(get_db)):
    """Create a new work log entry."""
    athlete = db.get(Athlete, body.athlete_id)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    entry = WorkLog(
        athlete_id=body.athlete_id,
        notification_id=body.notification_id,
        duration_seconds=body.duration_seconds,
        action=body.action,
        note=body.note,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return WorkLogResponse(
        id=entry.id,
        athlete_id=entry.athlete_id,
        athlete_name=athlete.name,
        notification_id=entry.notification_id,
        duration_seconds=entry.duration_seconds,
        action=entry.action,
        note=entry.note,
        created_at=entry.created_at,
    )


@router.delete("/{work_log_id}")
def delete_work_log(work_log_id: int, db: Session = Depends(get_db)):
    """Delete a work log entry (used for undo)."""
    entry = db.get(WorkLog, work_log_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Work log not found")
    db.delete(entry)
    db.commit()
    return {"status": "deleted", "id": work_log_id}


@router.get("", response_model=list[WorkLogResponse])
def list_work_logs(
    athlete_id: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List work log entries, optionally filtered by athlete."""
    query = db.query(WorkLog).order_by(WorkLog.created_at.desc())
    if athlete_id:
        query = query.filter(WorkLog.athlete_id == athlete_id)
    entries = query.limit(limit).all()

    results = []
    for entry in entries:
        athlete = db.get(Athlete, entry.athlete_id)
        results.append(
            WorkLogResponse(
                id=entry.id,
                athlete_id=entry.athlete_id,
                athlete_name=athlete.name if athlete else "Unknown",
                notification_id=entry.notification_id,
                duration_seconds=entry.duration_seconds,
                action=entry.action,
                note=entry.note,
                created_at=entry.created_at,
            )
        )
    return results


@router.get("/stats", response_model=WorkLogStats)
def get_work_log_stats(
    days: int = 30,
    db: Session = Depends(get_db),
):
    """Get aggregated work log statistics."""
    cutoff = datetime.utcnow() - timedelta(days=days)

    entries = (
        db.query(WorkLog)
        .filter(WorkLog.created_at >= cutoff)
        .all()
    )

    total_seconds = sum(e.duration_seconds for e in entries)
    total_entries = len(entries)
    avg_seconds = total_seconds / total_entries if total_entries > 0 else 0


    athlete_map: dict[int, dict] = {}
    for e in entries:
        if e.athlete_id not in athlete_map:
            athlete = db.get(Athlete, e.athlete_id)
            athlete_map[e.athlete_id] = {
                "athlete_id": e.athlete_id,
                "athlete_name": athlete.name if athlete else "Unknown",
                "total_seconds": 0,
                "entry_count": 0,
            }
        athlete_map[e.athlete_id]["total_seconds"] += e.duration_seconds
        athlete_map[e.athlete_id]["entry_count"] += 1

    by_athlete = sorted(athlete_map.values(), key=lambda x: x["total_seconds"], reverse=True)


    week_map: dict[str, dict] = {}
    for e in entries:
        week_start = (e.created_at - timedelta(days=e.created_at.weekday())).strftime("%Y-%m-%d")
        if week_start not in week_map:
            week_map[week_start] = {"week_start": week_start, "total_seconds": 0, "entry_count": 0}
        week_map[week_start]["total_seconds"] += e.duration_seconds
        week_map[week_start]["entry_count"] += 1

    by_week = sorted(week_map.values(), key=lambda x: x["week_start"])


    month_map: dict[str, dict] = {}
    for e in entries:
        month = e.created_at.strftime("%Y-%m")
        if month not in month_map:
            month_map[month] = {"month": month, "total_seconds": 0, "entry_count": 0}
        month_map[month]["total_seconds"] += e.duration_seconds
        month_map[month]["entry_count"] += 1

    by_month = sorted(month_map.values(), key=lambda x: x["month"])

    return WorkLogStats(
        total_entries=total_entries,
        total_seconds=total_seconds,
        avg_seconds_per_entry=round(avg_seconds, 1),
        by_athlete=by_athlete,
        by_week=by_week,
        by_month=by_month,
    )
