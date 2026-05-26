"""Routes for inbox notifications (program due reminders, etc.)."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.orm import (
    Athlete,
    ExerciseEntry,
    Notification,
    Program,
    Session as SessionModel,
)
from .deps import get_db
from .schemas import ManualQueueRequest, NotificationResponse

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _deduplicate_notifications(db: Session) -> None:
    """Remove duplicate notifications, keeping only the oldest per athlete+type+due_date.

    Duplicates can occur from race conditions when multiple API calls trigger
    _generate_program_due_reminders() concurrently.
    """

    dupes = (
        db.query(
            Notification.athlete_id,
            Notification.notification_type,
            Notification.due_date,
            func.min(Notification.id).label("keep_id"),
            func.count(Notification.id).label("cnt"),
        )
        .filter(Notification.archived == False)  # noqa: E712
        .group_by(
            Notification.athlete_id,
            Notification.notification_type,
            Notification.due_date,
        )
        .having(func.count(Notification.id) > 1)
        .all()
    )

    for dup in dupes:

        db.query(Notification).filter(
            Notification.athlete_id == dup.athlete_id,
            Notification.notification_type == dup.notification_type,
            Notification.due_date == dup.due_date,
            Notification.archived == False,  # noqa: E712
            Notification.id != dup.keep_id,
        ).delete(synchronize_session="fetch")

    if dupes:
        db.commit()


def _generate_program_due_reminders(db: Session) -> None:
    """Auto-create notifications for athletes whose program_due is approaching.

    For each active athlete with a program_due date, if today >= (due_date - reminder_days)
    and no notification already exists for that athlete + due_date combo, create one.
    """

    _deduplicate_notifications(db)

    today = date.today()

    athletes = (
        db.query(Athlete)
        .filter(Athlete.archived == False)  # noqa: E712
        .filter(Athlete.program_due.isnot(None))
        .filter(Athlete.program_due != "")
        .all()
    )

    for athlete in athletes:
        try:
            due_date = date.fromisoformat(athlete.program_due.strip())
        except (ValueError, TypeError):
            continue

        reminder_days = athlete.reminder_days_before if athlete.reminder_days_before is not None else 1
        remind_on = due_date - timedelta(days=reminder_days)

        if today < remind_on:
            continue


        existing = (
            db.query(Notification)
            .filter(
                Notification.athlete_id == athlete.id,
                Notification.notification_type == "program_due",
                Notification.due_date == athlete.program_due.strip(),
                Notification.archived == False,  # noqa: E712
            )
            .first()
        )

        if existing:
            continue


        notif = Notification(
            athlete_id=athlete.id,
            notification_type="program_due",
            title=f"Reminder in {athlete.name}",
            message=f"Program Due {due_date.strftime('%B %d, %Y')}",
            due_date=athlete.program_due.strip(),
        )
        db.add(notif)

    db.commit()


def _generate_rpe_review_flags(db: Session) -> None:
    """Open an inbox flag for any athlete with a typo-looking RPE entry.

    A number just over 10 is parsed as a failed lift (the team's shorthand for
    a missed attempt), so it never reaches here. What stays
    ``rpe_needs_review`` is the implausible stuff: a value well outside
    [1, 10], i.e. a misplaced weight or a typo (67, 910, 0). Those can't be
    trusted and don't count toward a max, so we surface them for the coach to
    check or correct. One open notification per athlete, recreated if archived
    while flagged sets remain, mirroring ``_generate_program_due_reminders``.
    """
    flagged = (
        db.query(ExerciseEntry, Program, SessionModel, Athlete)
        .join(SessionModel, ExerciseEntry.session_id == SessionModel.id)
        .join(Program, SessionModel.program_id == Program.id)
        .join(Athlete, Program.athlete_id == Athlete.id)
        .filter(Athlete.archived == False)  # noqa: E712
        .filter(ExerciseEntry.rpe_needs_review == True)  # noqa: E712
        # Only flag the heavy work that could actually be a missed PR: a
        # competition-lift top set. Accessories and backdown sets routinely
        # carry stray numbers in the RPE column and would otherwise bury the
        # one set that matters under dozens of harmless ones.
        .filter(ExerciseEntry.lift_category.in_(("squat", "bench", "deadlift")))
        .filter(ExerciseEntry.is_accessory == False)  # noqa: E712
        .filter(ExerciseEntry.set_type == "top_set")
        .filter(ExerciseEntry.weight_lbs.isnot(None))
        .order_by(
            Athlete.id,
            Program.program_number.desc(),
            SessionModel.week_number.desc(),
            SessionModel.day_number.desc(),
        )
        .all()
    )

    # Group newest-first per athlete so we can name the most recent flagged set
    # and point the deep-link at the block it lives in.
    by_athlete: dict[int, list] = {}
    for ex, prog, sess, _ath in flagged:
        by_athlete.setdefault(prog.athlete_id, []).append((ex, prog, sess))

    for athlete_id, entries in by_athlete.items():
        existing = (
            db.query(Notification)
            .filter(
                Notification.athlete_id == athlete_id,
                Notification.notification_type == "rpe_review",
                Notification.archived == False,  # noqa: E712
            )
            .first()
        )
        if existing:
            continue

        ex, prog, sess = entries[0]
        lift_label = (ex.lift_category or "lift").capitalize()
        weight = f"{ex.weight_lbs:g}" if ex.weight_lbs is not None else "?"
        reps = ex.reps if ex.reps is not None else "?"
        raw = ex.rpe_raw_value or "an out-of-range value"
        more = f" (+{len(entries) - 1} more)" if len(entries) > 1 else ""
        message = (
            f"{lift_label} {weight} x {reps} has an out-of-range RPE entry "
            f"('{raw}') in Program {prog.program_number} "
            f"(W{sess.week_number} D{sess.day_number}){more}. Looks like a typo "
            "or misplaced value, so it isn't counting toward a max until you fix it."
        )
        db.add(
            Notification(
                athlete_id=athlete_id,
                notification_type="rpe_review",
                title="RPE needs review",
                message=message,
                due_date=None,
                link_program_id=prog.id,
            )
        )

    db.commit()


def _enrich_notification(notif: Notification, db: Session) -> NotificationResponse:
    """Convert a Notification ORM object to a response with athlete name.

    For notifications that point at a program (link_program_id), also resolve
    that program's Google Sheet URL so the inbox can open the source workbook.
    """
    resp = NotificationResponse.model_validate(notif)
    resp.athlete_name = notif.athlete.name if notif.athlete else ""
    if notif.link_program_id:
        resp.link_sheet_url = (
            db.query(Program.google_sheet_url)
            .filter(Program.id == notif.link_program_id)
            .scalar()
        )
    return resp


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    include_archived: bool = Query(False),
    limit: int | None = Query(None, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List notifications (inbox). Auto-generates program-due reminders on
    each call.

    RPE-review flags are no longer surfaced here: they're a per-athlete data
    issue, not a dated work item, so they live on the athlete review page
    (``/athletes/{id}/review``, backed by the analytics ``rpe-review``
    endpoint). Any pre-existing ``rpe_review`` rows are filtered out below.
    """
    _generate_program_due_reminders(db)

    query = db.query(Notification).filter(
        Notification.notification_type != "rpe_review"
    )
    if not include_archived:
        query = query.filter(Notification.archived == False)  # noqa: E712

    query = query.order_by(Notification.created_at.desc())
    if limit is not None:
        query = query.limit(limit)

    notifications = query.all()
    return [_enrich_notification(n, db) for n in notifications]


@router.get("/count")
def notification_count(db: Session = Depends(get_db)):
    """Get count of unarchived notifications (for sidebar badge).

    Counts all unarchived notifications so the badge matches what the user
    sees when they open the inbox.
    """
    _generate_program_due_reminders(db)
    count = (
        db.query(Notification)
        .filter(Notification.archived == False)  # noqa: E712
        .filter(Notification.notification_type != "rpe_review")
        .count()
    )
    return {"count": count}


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    """Mark a notification as read (removes blue dot but keeps it visible)."""
    from fastapi import HTTPException

    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    db.commit()
    db.refresh(notif)
    return _enrich_notification(notif, db)


@router.post("/{notification_id}/unread", response_model=NotificationResponse)
def mark_notification_unread(notification_id: int, db: Session = Depends(get_db)):
    """Mark a notification as unread (restores blue dot)."""
    from fastapi import HTTPException

    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = False
    db.commit()
    db.refresh(notif)
    return _enrich_notification(notif, db)


@router.post("/{notification_id}/archive", response_model=NotificationResponse)
def archive_notification(notification_id: int, db: Session = Depends(get_db)):
    """Archive (dismiss) a notification."""
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.archived = True
    db.commit()
    db.refresh(notif)
    return _enrich_notification(notif, db)


@router.post("/{notification_id}/unarchive", response_model=NotificationResponse)
def unarchive_notification(notification_id: int, db: Session = Depends(get_db)):
    """Unarchive a notification (restore to inbox)."""
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.archived = False
    db.commit()
    db.refresh(notif)
    return _enrich_notification(notif, db)


@router.post("/manual", response_model=NotificationResponse)
def add_manual_queue_entry(body: ManualQueueRequest, db: Session = Depends(get_db)):
    """Manually add an athlete to the work queue.

    Creates a notification with type 'manual_queue' so the queue page
    can distinguish ad hoc entries from auto-generated program_due reminders.
    Prevents duplicates: if an unarchived manual_queue notification already
    exists for this athlete, return it instead of creating a new one.
    """
    from fastapi import HTTPException

    athlete = db.query(Athlete).filter(Athlete.id == body.athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")


    existing = (
        db.query(Notification)
        .filter(
            Notification.athlete_id == body.athlete_id,
            Notification.notification_type == "manual_queue",
            Notification.archived == False,  # noqa: E712
        )
        .first()
    )
    if existing:
        return _enrich_notification(existing, db)

    notif = Notification(
        athlete_id=body.athlete_id,
        notification_type="manual_queue",
        title=f"Review {athlete.name}",
        message=body.note or "Manually added to work queue",
        due_date=None,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return _enrich_notification(notif, db)


@router.delete("/{notification_id}", response_model=NotificationResponse)
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    """Delete a manual_queue notification (remove from queue without completing).

    Only manual_queue notifications can be deleted this way. Program_due
    notifications should be archived through the normal completion flow.
    """
    from fastapi import HTTPException

    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notif.notification_type != "manual_queue":
        raise HTTPException(status_code=400, detail="Only manual queue entries can be deleted")

    resp = _enrich_notification(notif, db)
    db.delete(notif)
    db.commit()
    return resp
