"""CRUD routes for athletes."""

from __future__ import annotations

import csv
import io
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..models.orm import Athlete, AthleteSession, DailyWellness, GDriveImport, MaxHistory, MeetResult, Notification, OplLink, OplMeet, Program, Session as SessionModel, WorkLog
from .deps import get_db
from .schemas import AthleteCreate, AthleteListResponse, AthleteResponse, AthleteUpdate, MaxHistoryEntry, MergePreview, MergeRequest, MergeResult, PendingMeetResults, ProgramListResponse, FixDuplicateDaysResult
from .error_helpers import safe_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/athletes", tags=["athletes"])


def _unwatch_folders_for_athlete(athlete_name: str, db: Session | None = None) -> int:
    """Drop any Drive watched folders whose name matches the athlete.

    Matched by normalized name (lowercase + strip). Returns the number of
    folders removed. Never raises — a broken GDrive config shouldn't block
    archiving an athlete.
    """
    try:
        from ..gdrive import client
        from ..gdrive.organize import _normalize_name
    except Exception:
        return 0
    try:
        target = _normalize_name(athlete_name)
        watched = client.get_watched_folders(db=db)
        remaining = [w for w in watched if _normalize_name(w.get("name", "")) != target]
        removed = len(watched) - len(remaining)
        if removed:
            client.set_watched_folders(remaining, db=db)
        return removed
    except Exception as exc:
        logger.warning("Failed to unwatch folders for athlete %r: %s", athlete_name, exc)
        return 0


def calculate_availability_status(out_from: str | None, out_through: str | None) -> str:
    """Calculate availability status based on time-off start and end dates.

    Returns "Available" if no time-off dates, "Out, back in X days" if currently
    out, "Out in X days" if time off is within the next 30 days, or "Available"
    otherwise (including when the window has already passed).
    """
    if not out_from or not out_through:
        return "Available"
    try:
        start = date.fromisoformat(out_from.strip())
        end = date.fromisoformat(out_through.strip())
    except (ValueError, TypeError):
        return "Available"
    today = date.today()
    if start <= today <= end:
        days_left = (end - today).days
        return f"Out, back in {days_left} days"
    if today < start <= today + timedelta(days=30):
        days_until = (start - today).days
        return f"Out in {days_until} days"
    return "Available"


def _pending_meet_results(db: Session, athlete: Athlete) -> PendingMeetResults | None:
    """Return the athlete's past-but-unlogged meet assignment, if any.

    AthleteBase.recompute_countdown nulls next_meet_* on responses once the
    meet date has passed; this field re-surfaces that meet only when no
    MeetResult rows exist for it yet, so the profile's "log results" banner
    has a signal to render against.
    """
    meet_date = athlete.meet_date
    if not meet_date:
        return None
    try:
        if date.fromisoformat(meet_date.strip()) >= date.today():
            return None
    except (ValueError, TypeError):
        return None


    clauses = [MeetResult.meet_date == meet_date]
    if athlete.next_meet_id is not None:
        clauses.append(MeetResult.meet_id == athlete.next_meet_id)
    if athlete.next_meet_name:
        clauses.append(
            and_(
                MeetResult.meet_name == athlete.next_meet_name,
                MeetResult.meet_date == meet_date,
            )
        )
    q = db.query(MeetResult).filter(
        MeetResult.athlete_id == athlete.id, or_(*clauses)
    )
    if q.first() is not None:
        return None


    meet_date_end: str | None = None
    if athlete.next_meet_id is not None:
        from ..models.orm import Meet
        meet = db.query(Meet).filter(Meet.id == athlete.next_meet_id).first()
        if meet is not None:
            meet_date_end = meet.meet_date_end
    return PendingMeetResults(
        meet_id=athlete.next_meet_id,
        meet_name=athlete.next_meet_name,
        meet_date=meet_date,
        meet_date_end=meet_date_end,
    )


def _latest_program_info(db: Session, athlete_id: int) -> dict:
    """Get the latest program's name, URL, and block type for an athlete."""
    latest = (
        db.query(Program)
        .filter(Program.athlete_id == athlete_id)
        .order_by(Program.program_number.desc(), Program.id.desc())
        .first()
    )
    if latest:
        return {
            "latest_program_name": latest.program_name,
            "latest_program_id": latest.id,
            "latest_program_sheet_url": latest.google_sheet_url,
            "latest_block_type": latest.block_type,
        }
    return {
        "latest_program_name": None,
        "latest_program_id": None,
        "latest_program_sheet_url": None,
        "latest_block_type": None,
    }


def _last_synced_at(db: Session, athlete_id: int):
    """Most recent successful Drive sync across this athlete's programs.

    Reads gdrive_imports.imported_at (which is bumped on every re-record) so
    re-imports of an existing program update the timestamp, not just first
    imports. Returns None if no Drive-sourced program exists for this athlete.
    """
    from sqlalchemy import func
    return (
        db.query(func.max(GDriveImport.imported_at))
        .join(Program, Program.id == GDriveImport.program_id)
        .filter(Program.athlete_id == athlete_id)
        .filter(GDriveImport.status == "success")
        .scalar()
    )


def _latest_bodyweight(db: Session, athlete_id: int) -> float | None:
    """Most recent logged bodyweight for an athlete (or None)."""
    row = (
        db.query(DailyWellness.bodyweight_lbs)
        .filter(
            DailyWellness.athlete_id == athlete_id,
            DailyWellness.bodyweight_lbs.isnot(None),
        )
        .order_by(DailyWellness.date.desc())
        .first()
    )
    return float(row[0]) if row and row[0] is not None else None


@router.get("", response_model=list[AthleteListResponse])
def list_athletes(include_archived: bool = Query(False), db: Session = Depends(get_db)):
    query = db.query(Athlete)
    if not include_archived:
        query = query.filter(Athlete.archived == False)  # noqa: E712
    athletes = query.order_by(Athlete.name).all()
    results = []
    for a in athletes:
        prog_count = db.query(Program).filter(Program.athlete_id == a.id).count()
        prog_info = _latest_program_info(db, a.id)
        item = AthleteListResponse.model_validate(a)
        item.program_count = prog_count
        item.latest_program_name = prog_info["latest_program_name"]
        item.latest_program_id = prog_info["latest_program_id"]
        item.latest_program_sheet_url = prog_info["latest_program_sheet_url"]
        item.latest_block_type = prog_info["latest_block_type"]
        item.latest_bodyweight_lbs = _latest_bodyweight(db, a.id)

        item.availability_status = calculate_availability_status(a.out_from, a.out_through)
        results.append(item)
    return results


_EXPORT_COLUMNS = [
    ("name", "Name"),
    ("age", "Age"),
    ("sex", "Sex"),
    ("equipment", "Equipment"),
    ("division", "Division"),
    ("weight_class", "Weight Class"),
    ("squat_max_lbs", "Squat (lbs)"),
    ("bench_max_lbs", "Bench (lbs)"),
    ("deadlift_max_lbs", "Deadlift (lbs)"),
    ("total_lbs", "Total (lbs)"),
    ("program_due", "Program Due"),
    ("next_meet_name", "Next Meet"),
    ("meet_date", "Meet Date"),
    ("email", "Email"),
    ("phone", "Phone"),
    ("availability_status", "Availability"),
    ("out_from", "Out From"),
    ("out_through", "Out Through"),
    ("tags", "Tags"),
]


@router.get("/export.csv")
def export_athletes_csv(
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Stream a CSV export of the athlete roster."""
    from fastapi.responses import StreamingResponse

    query = db.query(Athlete)
    if not include_archived:
        query = query.filter(Athlete.archived == False)  # noqa: E712
    athletes = query.order_by(Athlete.name).all()

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([label for _, label in _EXPORT_COLUMNS])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        for a in athletes:
            a.availability_status = calculate_availability_status(a.out_from, a.out_through)
            writer.writerow([
                getattr(a, key) if getattr(a, key, None) is not None else ""
                for key, _ in _EXPORT_COLUMNS
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    filename = f"athletes-{date.today().isoformat()}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{athlete_id}", response_model=AthleteResponse)
def get_athlete(athlete_id: int, db: Session = Depends(get_db)):
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    prog_count = db.query(Program).filter(Program.athlete_id == athlete.id).count()
    prog_info = _latest_program_info(db, athlete.id)
    resp = AthleteResponse.model_validate(athlete)
    resp.program_count = prog_count
    resp.latest_program_name = prog_info["latest_program_name"]
    resp.latest_program_id = prog_info["latest_program_id"]
    resp.latest_program_sheet_url = prog_info["latest_program_sheet_url"]
    resp.latest_block_type = prog_info["latest_block_type"]
    resp.pending_meet_results = _pending_meet_results(db, athlete)
    resp.last_synced_at = _last_synced_at(db, athlete.id)

    resp.availability_status = calculate_availability_status(
        athlete.out_from, athlete.out_through
    )
    return resp


@router.post("", response_model=AthleteResponse, status_code=201)
def create_athlete(data: AthleteCreate, db: Session = Depends(get_db)):
    existing = db.query(Athlete).filter(Athlete.name == data.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Athlete '{data.name}' already exists")
    payload = data.model_dump()

    payload.pop("availability_status", None)
    athlete = Athlete(**payload)
    athlete.availability_status = calculate_availability_status(
        athlete.out_from, athlete.out_through
    )
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    resp = AthleteResponse.model_validate(athlete)
    resp.program_count = 0
    resp.pending_meet_results = _pending_meet_results(db, athlete)
    return resp


@router.patch("/{athlete_id}", response_model=AthleteResponse)
def update_athlete(athlete_id: int, data: AthleteUpdate, db: Session = Depends(get_db)):
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    updates = data.model_dump(exclude_unset=True)


    if "program_due" in updates and updates["program_due"] != athlete.program_due:
        from datetime import date as date_type

        new_due = updates["program_due"]
        existing_notif = (
            db.query(Notification)
            .filter(
                Notification.athlete_id == athlete_id,
                Notification.notification_type == "program_due",
                Notification.archived == False,  # noqa: E712
            )
            .first()
        )

        if new_due:

            try:
                parsed = date_type.fromisoformat(new_due.strip())
                display_date = parsed.strftime("%B %d, %Y")
            except (ValueError, TypeError):
                display_date = new_due

            if existing_notif:

                existing_notif.due_date = new_due.strip()
                existing_notif.message = f"Program Due {display_date}"
                existing_notif.read = False
            else:

                new_notif = Notification(
                    athlete_id=athlete_id,
                    notification_type="program_due",
                    title=f"Reminder in {athlete.name}",
                    message=f"Program Due {display_date}",
                    due_date=new_due.strip(),
                )
                db.add(new_notif)
        elif existing_notif:

            existing_notif.read = True


    if "out_from" in updates or "out_through" in updates:
        new_start = updates.get("out_from", athlete.out_from)
        new_end = updates.get("out_through", athlete.out_through)
        updates["availability_status"] = calculate_availability_status(new_start, new_end)


    from ..services.max_tracking import log_max_changes
    log_max_changes(db, athlete, updates, source="manual")

    program_due_changed = (
        "program_due" in updates and updates["program_due"] != athlete.program_due
    )
    availability_changed = (
        ("out_from" in updates and updates["out_from"] != athlete.out_from)
        or ("out_through" in updates and updates["out_through"] != athlete.out_through)
    )
    dob_changed = "dob" in updates and updates["dob"] != athlete.dob

    for key, value in updates.items():
        setattr(athlete, key, value)
    db.commit()
    db.refresh(athlete)


    if program_due_changed or availability_changed or dob_changed:
        try:
            from ..gcal import client as _gcal_client, sync as _gcal_sync
            if _gcal_client.is_authenticated(db=db):
                options = _gcal_client.get_sync_options(db=db)

                if program_due_changed and (athlete.program_due or "").strip():
                    if options.get("programs", False):
                        _gcal_sync.safe_push(
                            db,
                            "programs",
                            athlete.id,
                            athlete.name,
                            lambda: _gcal_sync.sync_single_athlete_program(db, athlete.id),
                        )

                if availability_changed:
                    has_range = (
                        (athlete.out_from or "").strip()
                        and (athlete.out_through or "").strip()
                    )
                    is_past = _gcal_sync._is_past_availability(athlete)
                    if has_range and not is_past and options.get("availability", False):
                        _gcal_sync.safe_push(
                            db,
                            "availability",
                            athlete.id,
                            athlete.name,
                            lambda: _gcal_sync.sync_single_athlete_availability(db, athlete.id),
                        )

                if dob_changed and (athlete.dob or "").strip():
                    if options.get("birthdays", False):
                        _gcal_sync.safe_push(
                            db,
                            "birthdays",
                            athlete.id,
                            athlete.name,
                            lambda: _gcal_sync.sync_single_athlete_birthday(db, athlete.id),
                        )
        except Exception as e:  # noqa: BLE001
            logger.warning("Calendar push setup failed (athlete=%s): %s", athlete.id, e)

    prog_count = db.query(Program).filter(Program.athlete_id == athlete.id).count()
    resp = AthleteResponse.model_validate(athlete)
    resp.program_count = prog_count
    resp.pending_meet_results = _pending_meet_results(db, athlete)

    resp.availability_status = calculate_availability_status(
        athlete.out_from, athlete.out_through
    )
    return resp


@router.post("/{athlete_id}/archive", response_model=AthleteResponse)
def archive_athlete(athlete_id: int, db: Session = Depends(get_db)):
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    athlete.archived = True
    db.commit()
    db.refresh(athlete)
    removed = _unwatch_folders_for_athlete(athlete.name, db=db)
    if removed:
        logger.info("Unwatched %d Drive folder(s) for archived athlete %r", removed, athlete.name)
    prog_count = db.query(Program).filter(Program.athlete_id == athlete.id).count()
    resp = AthleteResponse.model_validate(athlete)
    resp.program_count = prog_count
    resp.pending_meet_results = _pending_meet_results(db, athlete)
    return resp


@router.post("/{athlete_id}/unarchive", response_model=AthleteResponse)
def unarchive_athlete(athlete_id: int, db: Session = Depends(get_db)):
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    athlete.archived = False
    db.commit()
    db.refresh(athlete)
    prog_count = db.query(Program).filter(Program.athlete_id == athlete.id).count()
    resp = AthleteResponse.model_validate(athlete)
    resp.program_count = prog_count
    resp.pending_meet_results = _pending_meet_results(db, athlete)
    return resp


@router.delete("/{athlete_id}", status_code=204)
def delete_athlete(athlete_id: int, db: Session = Depends(get_db)):
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    db.delete(athlete)
    db.commit()


@router.get("/{athlete_id}/merge-preview/{secondary_id}", response_model=MergePreview)
def merge_preview(athlete_id: int, secondary_id: int, db: Session = Depends(get_db)):
    """Preview what a merge would look like before executing it."""
    primary = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not primary:
        raise HTTPException(status_code=404, detail="Primary athlete not found")
    secondary = db.query(Athlete).filter(Athlete.id == secondary_id).first()
    if not secondary:
        raise HTTPException(status_code=404, detail="Secondary athlete not found")
    if athlete_id == secondary_id:
        raise HTTPException(status_code=400, detail="Cannot merge an athlete with themselves")

    primary_programs = db.query(Program).filter(Program.athlete_id == athlete_id).count()
    secondary_programs = db.query(Program).filter(Program.athlete_id == secondary_id).count()

    return MergePreview(
        primary_id=primary.id,
        primary_name=primary.name,
        secondary_id=secondary.id,
        secondary_name=secondary.name,
        primary_program_count=primary_programs,
        secondary_program_count=secondary_programs,
        programs_to_transfer=secondary_programs,
    )


@router.post("/{athlete_id}/merge/{secondary_id}", response_model=MergeResult)
def merge_athletes(
    athlete_id: int,
    secondary_id: int,
    data: MergeRequest,
    db: Session = Depends(get_db),
):
    """Merge secondary athlete into primary athlete.

    - Transfers all programs/sessions/exercises from secondary to primary
    - Fills in empty fields on primary from secondary (unless keep_name overrides name)
    - Deletes the secondary athlete after merge
    """
    primary = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not primary:
        raise HTTPException(status_code=404, detail="Primary athlete not found")
    secondary = db.query(Athlete).filter(Athlete.id == secondary_id).first()
    if not secondary:
        raise HTTPException(status_code=404, detail="Secondary athlete not found")
    if athlete_id == secondary_id:
        raise HTTPException(status_code=400, detail="Cannot merge an athlete with themselves")


    if data.keep_name:
        primary.name = data.keep_name


    fill_fields = [
        "squat_max_lbs", "bench_max_lbs", "deadlift_max_lbs", "total_lbs",
        "goal", "next_meet_date", "age", "dob", "division", "weight_class",
        "program_due", "next_meet_name", "next_meet_id", "meet_date",
        "weeks_out", "days_out", "availability_status", "out_from",
        "out_through", "email", "phone", "membership_no", "lifting_db_link",
        "tags", "primary_squat_day", "primary_bench_day", "primary_deadlift_day",
    ]
    for field in fill_fields:
        primary_val = getattr(primary, field, None)
        secondary_val = getattr(secondary, field, None)
        if primary_val is None and secondary_val is not None:
            setattr(primary, field, secondary_val)


    try:
        # OplLink has UNIQUE(athlete_id), so at most one wins. Keep primary's
        # if it exists; otherwise reassign secondary's. The corresponding
        # opl_meets rows have to follow the same decision so they don't
        # collide on UniqueConstraint(athlete_id, meet_path).
        primary_link = (
            db.query(OplLink).filter(OplLink.athlete_id == athlete_id).first()
        )
        secondary_link = (
            db.query(OplLink).filter(OplLink.athlete_id == secondary_id).first()
        )
        if secondary_link is not None:
            if primary_link is not None:
                db.query(OplMeet).filter(OplMeet.athlete_id == secondary_id).delete(
                    synchronize_session="fetch"
                )
                db.delete(secondary_link)
            else:
                secondary_link.athlete_id = athlete_id
                db.query(OplMeet).filter(OplMeet.athlete_id == secondary_id).update(
                    {OplMeet.athlete_id: athlete_id}, synchronize_session="fetch"
                )
        db.flush()

        programs_transferred = (
            db.query(Program)
            .filter(Program.athlete_id == secondary_id)
            .update({Program.athlete_id: athlete_id}, synchronize_session="fetch")
        )

        for model in (
            Notification,
            MaxHistory,
            WorkLog,
            DailyWellness,
            MeetResult,
            AthleteSession,
        ):
            db.query(model).filter(model.athlete_id == secondary_id).update(
                {model.athlete_id: athlete_id}, synchronize_session="fetch"
            )

        # Optional sibling-package rows that reference athlete_id:
        # reassign opportunistically. Swallow ImportError when the
        # sibling package isn't installed.
        try:
            from bestrong_cloud.billing.models import FailedPayment
        except ImportError:
            pass
        else:
            db.query(FailedPayment).filter(
                FailedPayment.athlete_id == secondary_id
            ).update(
                {FailedPayment.athlete_id: athlete_id}, synchronize_session="fetch"
            )

        db.delete(secondary)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(primary)

    prog_count = db.query(Program).filter(Program.athlete_id == primary.id).count()

    return MergeResult(
        merged_athlete_id=primary.id,
        merged_athlete_name=primary.name,
        programs_transferred=programs_transferred,
        total_programs=prog_count,
    )


@router.get("/{athlete_id}/programs", response_model=list[ProgramListResponse])
def list_athlete_programs(
    athlete_id: int,
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(get_db),
):
    """List all programs for a specific athlete."""

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    programs = (
        db.query(Program)
        .filter(Program.athlete_id == athlete_id)
        .order_by(Program.imported_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    results = []
    for p in programs:
        sess_count = db.query(SessionModel).filter(SessionModel.program_id == p.id).count()
        item = ProgramListResponse.model_validate(p)
        item.session_count = sess_count
        results.append(item)
    return results


@router.post("/import-csv", status_code=200)
def import_athletes_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import athletes from a CSV file (e.g., from Notion export).

    Expects CSV with columns: Name, Age, Division, Weight Class, Program Due, Next Meet, Meet Date.
    Upserts athletes by name (creates if new, updates if exists).
    """
    try:
        content = file.file.read().decode("utf-8")
        reader = csv.DictReader(io.StringIO(content))

        created_count = 0
        updated_count = 0
        errors = []

        for row_num, row in enumerate(reader, start=2):
            try:
                name = row.get("Name", "").strip()
                if not name:
                    errors.append(f"Row {row_num}: Missing or empty Name column")
                    continue


                athlete_data = {
                    "name": name,
                    "age": int(row.get("Age", "")) if row.get("Age", "").strip() else None,
                    "division": row.get("Division", "").strip() or None,
                    "weight_class": row.get("Weight Class", "").strip() or None,
                    "program_due": row.get("Program Due", "").strip() or None,
                    "next_meet_name": row.get("Next Meet", "").strip() or None,
                    "meet_date": row.get("Meet Date", "").strip() or None,
                }


                existing = db.query(Athlete).filter(Athlete.name == name).first()
                if existing:

                    for key, value in athlete_data.items():
                        setattr(existing, key, value)
                    updated_count += 1
                else:

                    athlete = Athlete(**athlete_data)
                    db.add(athlete)
                    created_count += 1

            except ValueError as e:
                errors.append(f"Row {row_num}: Invalid data - {str(e)}")
            except Exception:
                logger.exception("CSV import failed at row %d", row_num)
                errors.append(f"Row {row_num}: Unexpected error processing this row")

        db.commit()

        return {
            "success": True,
            "created": created_count,
            "updated": updated_count,
            "errors": errors,
        }

    except Exception as e:
        safe_error(e, "Failed to parse CSV file", status_code=400)


def _fix_duplicate_days_for_programs(db: Session, programs: list[Program]) -> dict:
    """Fix duplicate Day 3 sessions in a list of programs.

    For each program, looks at sessions grouped by (week_number, day_number).
    If a week has two sets of sessions labeled Day 3 but no Day 4,
    renumbers the second batch of Day 3 sessions to Day 4.

    Returns a dict with:
    - weeks_fixed: number of weeks with duplicates fixed
    - sessions_updated: total number of sessions updated
    - details: list of human-readable descriptions of changes
    """
    weeks_fixed = 0
    sessions_updated = 0
    details = []

    for program in programs:

        sessions_by_week = {}
        for session in program.sessions:
            if session.week_number not in sessions_by_week:
                sessions_by_week[session.week_number] = {}
            if session.day_number not in sessions_by_week[session.week_number]:
                sessions_by_week[session.week_number][session.day_number] = []
            sessions_by_week[session.week_number][session.day_number].append(session)


        for week_number, days in sessions_by_week.items():
            day_3_sessions = days.get(3, [])
            day_4_sessions = days.get(4, [])

            if len(day_3_sessions) > 1 and not day_4_sessions:

                day_3_sessions_sorted = sorted(day_3_sessions, key=lambda s: s.id)


                mid = len(day_3_sessions_sorted) // 2
                second_day_3 = day_3_sessions_sorted[mid:]


                day_4_name = None
                for other_week in sessions_by_week.values():
                    if 4 in other_week and other_week[4]:
                        day_4_name = other_week[4][0].day_name
                        break


                if not day_4_name:
                    day_4_name = "Day 4"


                for session in second_day_3:
                    session.day_number = 4
                    session.day_name = day_4_name
                    sessions_updated += 1

                weeks_fixed += 1
                details.append(
                    f"Program '{program.program_name}' (ID {program.id}), Week {week_number}: "
                    f"Fixed {len(second_day_3)} duplicate Day 3 session(s) -> Day 4"
                )

    if sessions_updated > 0:
        db.commit()

    return {
        "weeks_fixed": weeks_fixed,
        "sessions_updated": sessions_updated,
        "details": details,
    }


@router.get("/{athlete_id}/max-history", response_model=list[MaxHistoryEntry])
def get_max_history(
    athlete_id: int,
    lift: str | None = Query(None, description="Filter by lift: squat, bench, deadlift, total"),
    db: Session = Depends(get_db),
):
    """Get the history of max lift changes for an athlete."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    query = db.query(MaxHistory).filter(MaxHistory.athlete_id == athlete_id)
    if lift:
        query = query.filter(MaxHistory.lift == lift)
    entries = query.order_by(MaxHistory.recorded_at.desc()).all()
    return entries


@router.post("/{athlete_id}/fix-duplicate-days", response_model=FixDuplicateDaysResult)
def fix_duplicate_days(athlete_id: int, db: Session = Depends(get_db)):
    """Fix duplicate Day 3 sessions for an athlete's programs.

    For each program, identifies weeks where Day 3 appears more than once
    but Day 4 doesn't exist, and renumbers the second set of Day 3 sessions
    to Day 4.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")


    programs = db.query(Program).filter(Program.athlete_id == athlete_id).all()

    result = _fix_duplicate_days_for_programs(db, programs)

    return FixDuplicateDaysResult(
        athlete_name=athlete.name,
        programs_checked=len(programs),
        weeks_fixed=result["weeks_fixed"],
        sessions_updated=result["sessions_updated"],
        details=result["details"],
    )
