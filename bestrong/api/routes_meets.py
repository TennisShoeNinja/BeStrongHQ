"""CRUD routes for meets."""

from __future__ import annotations

import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.orm import Athlete, Meet, Program
from ..utils.dates import compute_days_out, compute_weeks_out
from .deps import get_db
from .schemas import (
    AthleteReadiness,
    MeetCreate,
    MeetListResponse,
    MeetPrepResponse,
    MeetResponse,
    MeetUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meets", tags=["meets"])


def _maybe_push_meet_to_calendar(db: Session, meet: Meet) -> None:
    """Best-effort calendar push for a meet. Skips when the calendar isn't
    connected, the Meets toggle is off, or the meet has no date. Failures
    are captured in the per-instance sync-error buffer (visible on the
    Calendar integrations page) — never raises into the parent request.
    """
    if not (meet.meet_date or "").strip():
        return
    try:
        from ..gcal import client as _gcal_client, sync as _gcal_sync
        if _gcal_sync._is_past_meet(meet):
            return
        if not _gcal_client.is_authenticated(db=db):
            return
        if not _gcal_client.get_sync_options(db=db).get("meets", False):
            return
        _gcal_sync.safe_push(
            db,
            "meets",
            meet.id,
            meet.name or f"Meet {meet.id}",
            lambda: _gcal_sync.sync_single_meet(db, meet.id),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Calendar push setup failed for meet=%s: %s", meet.id, exc)


@router.get("", response_model=list[MeetListResponse])
def list_meets(db: Session = Depends(get_db)):
    meets = db.query(Meet).order_by(Meet.meet_date.desc()).all()
    results = []
    for m in meets:
        item = MeetListResponse.model_validate(m)

        item.athlete_count = db.query(Athlete).filter(Athlete.next_meet_id == m.id).count()
        results.append(item)
    return results


@router.post("", response_model=MeetResponse, status_code=201)
def create_meet(data: MeetCreate, db: Session = Depends(get_db)):
    meet = Meet(**data.model_dump())

    if meet.meet_date:
        meet.weeks_out = compute_weeks_out(meet.meet_date)
        meet.days_out = compute_days_out(meet.meet_date)
    db.add(meet)
    db.commit()
    db.refresh(meet)
    _maybe_push_meet_to_calendar(db, meet)
    resp = MeetResponse.model_validate(meet)
    resp.athlete_count = 0
    resp.competing_athletes = []
    return resp


@router.get("/{meet_id}", response_model=MeetResponse)
def get_meet(meet_id: int, db: Session = Depends(get_db)):
    meet = db.query(Meet).filter(Meet.id == meet_id).first()
    if not meet:
        raise HTTPException(status_code=404, detail="Meet not found")
    resp = MeetResponse.model_validate(meet)

    athletes = db.query(Athlete).filter(Athlete.next_meet_id == meet.id).all()
    resp.athlete_count = len(athletes)
    resp.competing_athletes = [{"id": a.id, "name": a.name} for a in athletes]
    return resp


@router.patch("/{meet_id}", response_model=MeetResponse)
def update_meet(meet_id: int, data: MeetUpdate, db: Session = Depends(get_db)):
    meet = db.query(Meet).filter(Meet.id == meet_id).first()
    if not meet:
        raise HTTPException(status_code=404, detail="Meet not found")
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(meet, key, value)

    if "meet_date" in updates:
        meet.weeks_out = compute_weeks_out(meet.meet_date)
        meet.days_out = compute_days_out(meet.meet_date)

    athletes = db.query(Athlete).filter(Athlete.next_meet_id == meet.id).all()
    if athletes and ("name" in updates or "meet_date" in updates):
        for a in athletes:
            if "name" in updates:
                a.next_meet_name = meet.name
            if "meet_date" in updates:
                a.meet_date = meet.meet_date
                a.weeks_out = meet.weeks_out
                a.days_out = meet.days_out
    db.commit()
    db.refresh(meet)
    _maybe_push_meet_to_calendar(db, meet)
    resp = MeetResponse.model_validate(meet)
    resp.athlete_count = len(athletes)
    resp.competing_athletes = [{"id": a.id, "name": a.name} for a in athletes]
    return resp


@router.post("/{meet_id}/assign/{athlete_id}", response_model=MeetResponse)
def assign_athlete(meet_id: int, athlete_id: int, db: Session = Depends(get_db)):
    """Assign an athlete to this meet (sets their next_meet_id and denormalized fields)."""
    meet = db.query(Meet).filter(Meet.id == meet_id).first()
    if not meet:
        raise HTTPException(status_code=404, detail="Meet not found")
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    athlete.next_meet_id = meet.id
    athlete.next_meet_name = meet.name
    athlete.meet_date = meet.meet_date
    athlete.weeks_out = meet.weeks_out
    athlete.days_out = meet.days_out
    db.commit()
    db.refresh(meet)
    _maybe_push_meet_to_calendar(db, meet)
    athletes = db.query(Athlete).filter(Athlete.next_meet_id == meet.id).all()
    resp = MeetResponse.model_validate(meet)
    resp.athlete_count = len(athletes)
    resp.competing_athletes = [{"id": a.id, "name": a.name} for a in athletes]
    return resp


@router.post("/{meet_id}/unassign/{athlete_id}", response_model=MeetResponse)
def unassign_athlete(meet_id: int, athlete_id: int, db: Session = Depends(get_db)):
    """Remove an athlete from this meet (clears their next_meet fields)."""
    meet = db.query(Meet).filter(Meet.id == meet_id).first()
    if not meet:
        raise HTTPException(status_code=404, detail="Meet not found")
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if athlete.next_meet_id != meet.id:
        raise HTTPException(status_code=400, detail="Athlete is not assigned to this meet")
    athlete.next_meet_id = None
    athlete.next_meet_name = None
    athlete.meet_date = None
    athlete.weeks_out = None
    athlete.days_out = None
    db.commit()
    db.refresh(meet)
    _maybe_push_meet_to_calendar(db, meet)
    athletes = db.query(Athlete).filter(Athlete.next_meet_id == meet.id).all()
    resp = MeetResponse.model_validate(meet)
    resp.athlete_count = len(athletes)
    resp.competing_athletes = [{"id": a.id, "name": a.name} for a in athletes]
    return resp


@router.delete("/{meet_id}", status_code=204)
def delete_meet(meet_id: int, db: Session = Depends(get_db)):
    meet = db.query(Meet).filter(Meet.id == meet_id).first()
    if not meet:
        raise HTTPException(status_code=404, detail="Meet not found")

    db.query(Athlete).filter(Athlete.next_meet_id == meet_id).update(
        {"next_meet_id": None, "next_meet_name": None, "meet_date": None, "weeks_out": None, "days_out": None},
        synchronize_session="fetch",
    )
    db.delete(meet)
    db.commit()


@router.get("/{meet_id}/prep", response_model=MeetPrepResponse)
def get_meet_prep(meet_id: int, db: Session = Depends(get_db)):
    """Get meet prep readiness info for all athletes assigned to this meet."""
    meet = db.query(Meet).filter(Meet.id == meet_id).first()
    if not meet:
        raise HTTPException(status_code=404, detail="Meet not found")


    athletes = db.query(Athlete).filter(Athlete.next_meet_id == meet.id).all()

    readiness_list = []
    for athlete in athletes:

        latest_program = (
            db.query(Program)
            .filter(Program.athlete_id == athlete.id)
            .order_by(
                Program.program_number.desc().nullsfirst(),
                Program.imported_at.desc(),
            )
            .first()
        )


        program_week = None
        if latest_program and latest_program.date_start:
            try:
                program_start = datetime.strptime(latest_program.date_start, "%Y-%m-%d")
                today = datetime.now()
                days_into_program = (today - program_start).days
                week_into_program = (days_into_program // 7) + 1


                if latest_program.date_end:
                    program_end = datetime.strptime(latest_program.date_end, "%Y-%m-%d")
                    total_days = (program_end - program_start).days
                    total_weeks = (total_days // 7) + 1
                    program_week = f"Week {week_into_program} of {total_weeks}"
                else:
                    program_week = f"Week {week_into_program}"
            except (ValueError, TypeError):
                program_week = None


        days_until_meet = None
        weeks_until_meet = None
        if meet.meet_date:
            try:
                meet_date = datetime.strptime(meet.meet_date, "%Y-%m-%d")
                today = datetime.now()
                delta = (meet_date - today).days
                if delta >= 0:
                    days_until_meet = delta
                    weeks_until_meet = delta // 7
            except (ValueError, TypeError):
                pass

        readiness = AthleteReadiness(
            athlete_id=athlete.id,
            athlete_name=athlete.name,
            weight_class=athlete.weight_class,
            division=athlete.division,
            squat_max_lbs=athlete.squat_max_lbs,
            bench_max_lbs=athlete.bench_max_lbs,
            deadlift_max_lbs=athlete.deadlift_max_lbs,
            total_lbs=athlete.total_lbs,
            current_program_name=latest_program.program_name if latest_program else None,
            current_block_type=latest_program.block_type if latest_program else None,
            program_week=program_week,
            days_until_meet=days_until_meet,
            weeks_until_meet=weeks_until_meet,
        )
        readiness_list.append(readiness)

    return MeetPrepResponse(
        meet_id=meet.id,
        meet_name=meet.name,
        meet_date=meet.meet_date,
        athletes=readiness_list,
    )
