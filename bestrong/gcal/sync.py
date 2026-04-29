"""Sync meets to Google Calendar."""

from __future__ import annotations

import logging
from datetime import date as _date
from typing import Callable

from sqlalchemy.orm import Session

from ..models.orm import Athlete, Meet
from ..utils.log_sanitizer import sanitize
from . import client

logger = logging.getLogger(__name__)


def _is_past_meet(meet: Meet) -> bool:
    """Return True if the meet has already concluded.

    Past = the final date (``meet_date_end`` if set, otherwise ``meet_date``)
    is strictly before today, so multi-day meets currently in progress still
    sync. Unparseable dates fall through as not-past — better to push an event
    than silently drop a meet because of a typo.
    """
    final_raw = (meet.meet_date_end or meet.meet_date or "").strip()
    if not final_raw:
        return False
    try:
        final_date = _date.fromisoformat(final_raw)
    except ValueError:
        return False
    return final_date < _date.today()


def _is_past_availability(athlete: Athlete) -> bool:
    """Return True if the athlete's time-off window has already ended.

    Past = ``out_through`` parses and is strictly before today, so a
    window that ends today still syncs. Unparseable dates fall through
    as not-past so a typo can't silently drop a row.
    """
    end_raw = (athlete.out_through or "").strip()
    if not end_raw:
        return False
    try:
        end_date = _date.fromisoformat(end_raw)
    except ValueError:
        return False
    return end_date < _date.today()


def safe_push(
    db: Session,
    category: str,
    target_id: int,
    label: str,
    push: Callable[[], object],
) -> bool:
    """Run a single-target calendar push and capture failures into the
    per-instance outstanding-issue buffer. Returns True on success.

    Used by route-level auto-push hooks (athlete PATCH, meet POST/PATCH)
    so a calendar hiccup never fails the parent request, but the failure
    is visible to the coach on the integrations page instead of being
    silently swallowed.
    """
    try:
        push()
        client.clear_sync_error(category, target_id, db=db)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Calendar auto-push failed (category=%s target=%s label=%s): %s",
            category, target_id, sanitize(label), exc,
        )
        try:
            client.record_sync_error(category, target_id, label, str(exc), db=db)
        except Exception as buf_exc:  # noqa: BLE001
            logger.error(
                "Failed to record calendar sync error: %s (original: %s)",
                buf_exc, exc,
            )
        return False


def _build_description(meet: Meet, athletes: list[Athlete]) -> str:
    """Build the event description with meet details and competing athletes."""
    lines = []

    if meet.federation:
        lines.append(f"Federation: {meet.federation}")
    if meet.location:
        lines.append(f"Location: {meet.location}")
    if meet.liftingcast_link:
        lines.append(f"LiftingCast: {meet.liftingcast_link}")

    if athletes:
        lines.append("")
        lines.append(f"Competing Athletes ({len(athletes)}):")
        for a in sorted(athletes, key=lambda x: x.name):
            parts = [f"  - {a.name}"]
            if a.weight_class:
                parts.append(f"({a.weight_class})")
            if a.division:
                parts.append(f"- {a.division}")
            lines.append(" ".join(parts))

    return "\n".join(lines)


def sync_all_meets(db: Session) -> dict:
    """Sync all meets to Google Calendar.

    Returns a summary dict with counts.
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    meets = db.query(Meet).all()

    created = 0
    updated = 0
    errors = []
    mapping = client.get_event_mapping(db=db)

    for meet in meets:
        if not meet.meet_date:
            continue
        if _is_past_meet(meet):
            continue

        try:
            athletes = db.query(Athlete).filter(Athlete.next_meet_id == meet.id).all()
            description = _build_description(meet, athletes)

            was_existing = str(meet.id) in mapping

            client.create_or_update_event(
                meet_id=meet.id,
                title=meet.name,
                start_date=meet.meet_date,
                end_date=meet.meet_date_end,
                location=meet.location,
                description=description,
                db=db,
            )

            if was_existing:
                updated += 1
            else:
                created += 1
            client.clear_sync_error("meets", meet.id, db=db)

        except Exception as e:
            logger.error("Failed to sync meet %s: %s", sanitize(meet.name), e)
            errors.append(f"{meet.name}: {str(e)}")
            client.record_sync_error(
                "meets", meet.id, meet.name, str(e), db=db
            )

    return {
        "total_meets": len(meets),
        "created": created,
        "updated": updated,
        "errors": errors,
    }


def sync_single_meet(db: Session, meet_id: int) -> str:
    """Sync a single meet to Google Calendar. Returns the event ID."""
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    meet = db.query(Meet).filter(Meet.id == meet_id).first()
    if not meet:
        raise ValueError(f"Meet {meet_id} not found")
    if not meet.meet_date:
        raise ValueError(f"Meet {meet.name} has no date set")
    if _is_past_meet(meet):
        raise ValueError(f"Meet {meet.name} has already passed")

    athletes = db.query(Athlete).filter(Athlete.next_meet_id == meet.id).all()
    description = _build_description(meet, athletes)

    return client.create_or_update_event(
        meet_id=meet.id,
        title=meet.name,
        start_date=meet.meet_date,
        end_date=meet.meet_date_end,
        location=meet.location,
        description=description,
        db=db,
    )


def remove_meet_event(meet_id: int, db: Session | None = None) -> bool:
    """Remove a meet's calendar event."""
    if not client.is_authenticated(db=db):
        return False
    return client.delete_event(meet_id, db=db)


def _build_program_title(athlete: Athlete) -> str:
    return f"Program due — {athlete.name}"


def _build_program_description(athlete: Athlete) -> str:
    """Body of a program-due calendar event. Kept short — the event title
    already names the athlete; this fills in coaching context.
    """
    lines: list[str] = [f"Program due for {athlete.name}."]

    bits: list[str] = []
    if athlete.weight_class:
        bits.append(athlete.weight_class)
    if athlete.division:
        bits.append(athlete.division)
    if bits:
        lines.append(" / ".join(bits))

    if athlete.next_meet_name and athlete.meet_date:
        lines.append("")
        lines.append(f"Next meet: {athlete.next_meet_name} on {athlete.meet_date}")
    elif athlete.next_meet_name:
        lines.append("")
        lines.append(f"Next meet: {athlete.next_meet_name}")

    return "\n".join(lines)


def sync_all_programs(db: Session) -> dict:
    """Push every active athlete's ``program_due`` date to Google Calendar.

    Returns a summary dict with counts. Skips athletes who are archived or
    who have no ``program_due`` set.
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    athletes = (
        db.query(Athlete)
        .filter(Athlete.archived.is_(False))
        .filter(Athlete.program_due.isnot(None))
        .filter(Athlete.program_due != "")
        .all()
    )

    created = 0
    updated = 0
    errors: list[str] = []
    mapping = client.get_program_event_mapping(db=db)

    for athlete in athletes:
        due = (athlete.program_due or "").strip()
        if not due:
            continue

        try:
            was_existing = str(athlete.id) in mapping

            client.create_or_update_program_event(
                athlete_id=athlete.id,
                title=_build_program_title(athlete),
                due_date=due,
                description=_build_program_description(athlete),
                db=db,
            )

            if was_existing:
                updated += 1
            else:
                created += 1
            client.clear_sync_error("programs", athlete.id, db=db)

        except Exception as e:
            logger.error(
                "Failed to sync program-due for %s: %s", sanitize(athlete.name), e
            )
            errors.append(f"{athlete.name}: {str(e)}")
            client.record_sync_error(
                "programs", athlete.id, athlete.name, str(e), db=db
            )

    return {
        "total_programs": len(athletes),
        "created": created,
        "updated": updated,
        "errors": errors,
    }


def sync_single_athlete_program(db: Session, athlete_id: int) -> str:
    """Push a single athlete's program-due date. Returns the event ID."""
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise ValueError(f"Athlete {athlete_id} not found")
    due = (athlete.program_due or "").strip()
    if not due:
        raise ValueError(f"Athlete {athlete.name} has no program_due set")

    return client.create_or_update_program_event(
        athlete_id=athlete.id,
        title=_build_program_title(athlete),
        due_date=due,
        description=_build_program_description(athlete),
        db=db,
    )


def _build_availability_title(athlete: Athlete) -> str:
    return f"Unavailable — {athlete.name}"


def _build_availability_description(athlete: Athlete) -> str:
    lines: list[str] = [f"{athlete.name} is unavailable."]
    if athlete.out_from and athlete.out_through:
        lines.append(f"{athlete.out_from} through {athlete.out_through}")
    return "\n".join(lines)


def sync_all_availability(db: Session) -> dict:
    """Push every active athlete's time-off range to Google Calendar.

    Skips athletes who are archived, who have no ``out_from``, or
    who have no ``out_through`` (we need a full range — open-ended
    blocks would be misleading on a calendar).
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    athletes = (
        db.query(Athlete)
        .filter(Athlete.archived.is_(False))
        .filter(Athlete.out_from.isnot(None))
        .filter(Athlete.out_from != "")
        .filter(Athlete.out_through.isnot(None))
        .filter(Athlete.out_through != "")
        .all()
    )

    created = 0
    updated = 0
    errors: list[str] = []
    mapping = client.get_availability_event_mapping(db=db)

    for athlete in athletes:
        start = (athlete.out_from or "").strip()
        end = (athlete.out_through or "").strip()
        if not start or not end:
            continue
        if _is_past_availability(athlete):
            continue

        try:


            from datetime import date as _date_type, timedelta as _td

            try:
                parsed_end = _date_type.fromisoformat(end)
                exclusive_end = (parsed_end + _td(days=1)).isoformat()
            except ValueError:

                msg = "invalid availability end date"
                errors.append(f"{athlete.name}: {msg}")
                client.record_sync_error(
                    "availability", athlete.id, athlete.name, msg, db=db
                )
                continue

            was_existing = str(athlete.id) in mapping
            client.create_or_update_availability_event(
                athlete_id=athlete.id,
                title=_build_availability_title(athlete),
                start_date=start,
                end_date=exclusive_end,
                description=_build_availability_description(athlete),
                db=db,
            )
            if was_existing:
                updated += 1
            else:
                created += 1
            client.clear_sync_error("availability", athlete.id, db=db)

        except Exception as e:
            logger.error(
                "Failed to sync availability for %s: %s", sanitize(athlete.name), e
            )
            errors.append(f"{athlete.name}: {str(e)}")
            client.record_sync_error(
                "availability", athlete.id, athlete.name, str(e), db=db
            )

    return {
        "total_athletes": len(athletes),
        "created": created,
        "updated": updated,
        "errors": errors,
    }


def _build_birthday_title(athlete: Athlete) -> str:
    return f"Birthday — {athlete.name}"


def sync_all_birthdays(db: Session) -> dict:
    """Push a yearly-recurring birthday event for every athlete with a
    parseable ``dob``. Skips archived athletes and unparseable dates.
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    athletes = (
        db.query(Athlete)
        .filter(Athlete.archived.is_(False))
        .filter(Athlete.dob.isnot(None))
        .filter(Athlete.dob != "")
        .all()
    )

    created = 0
    updated = 0
    errors: list[str] = []
    mapping = client.get_birthday_event_mapping(db=db)

    from datetime import date as _date_type

    for athlete in athletes:
        dob_raw = (athlete.dob or "").strip()
        if not dob_raw:
            continue


        parsed: _date_type | None = None
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
            try:
                from datetime import datetime as _dt
                parsed = _dt.strptime(dob_raw, fmt).date()
                break
            except ValueError:
                continue
        if parsed is None:
            msg = "unparseable date of birth"
            errors.append(f"{athlete.name}: {msg}")
            client.record_sync_error(
                "birthdays", athlete.id, athlete.name, msg, db=db
            )
            continue

        try:
            was_existing = str(athlete.id) in mapping
            client.create_or_update_birthday_event(
                athlete_id=athlete.id,
                title=_build_birthday_title(athlete),
                birth_date=parsed.isoformat(),
                db=db,
            )
            if was_existing:
                updated += 1
            else:
                created += 1
            client.clear_sync_error("birthdays", athlete.id, db=db)
        except Exception as e:
            logger.error(
                "Failed to sync birthday for %s: %s", sanitize(athlete.name), e
            )
            errors.append(f"{athlete.name}: {str(e)}")
            client.record_sync_error(
                "birthdays", athlete.id, athlete.name, str(e), db=db
            )

    return {
        "total_athletes": len(athletes),
        "created": created,
        "updated": updated,
        "errors": errors,
    }


def sync_single_athlete_availability(db: Session, athlete_id: int) -> str:
    """Push a single athlete's availability range. Returns the event ID.

    Raises ``ValueError`` if the athlete is missing or has no usable range,
    ``RuntimeError`` if the calendar isn't authenticated.
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise ValueError(f"Athlete {athlete_id} not found")

    start = (athlete.out_from or "").strip()
    end = (athlete.out_through or "").strip()
    if not start or not end:
        raise ValueError(f"Athlete {athlete.name} has no availability range set")

    from datetime import date as _date_type, timedelta as _td

    try:
        parsed_end = _date_type.fromisoformat(end)
    except ValueError as exc:
        raise ValueError(
            f"Athlete {athlete.name} has an unparseable availability end date"
        ) from exc

    if _is_past_availability(athlete):
        raise ValueError(
            f"Athlete {athlete.name}'s availability window has already passed"
        )

    exclusive_end = (parsed_end + _td(days=1)).isoformat()

    return client.create_or_update_availability_event(
        athlete_id=athlete.id,
        title=_build_availability_title(athlete),
        start_date=start,
        end_date=exclusive_end,
        description=_build_availability_description(athlete),
        db=db,
    )


def sync_single_athlete_birthday(db: Session, athlete_id: int) -> str:
    """Push a single athlete's yearly-recurring birthday event. Returns the
    event ID. Raises ``ValueError`` if the athlete is missing or has no
    parseable DOB, ``RuntimeError`` if the calendar isn't authenticated.
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Calendar")

    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise ValueError(f"Athlete {athlete_id} not found")

    dob_raw = (athlete.dob or "").strip()
    if not dob_raw:
        raise ValueError(f"Athlete {athlete.name} has no date of birth set")

    from datetime import datetime as _dt, date as _date_type
    parsed: _date_type | None = None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            parsed = _dt.strptime(dob_raw, fmt).date()
            break
        except ValueError:
            continue
    if parsed is None:
        raise ValueError(f"Athlete {athlete.name} has an unparseable date of birth")

    return client.create_or_update_birthday_event(
        athlete_id=athlete.id,
        title=_build_birthday_title(athlete),
        birth_date=parsed.isoformat(),
        db=db,
    )


_EMPTY_MEETS = {"total_meets": 0, "created": 0, "updated": 0, "errors": []}
_EMPTY_PROGRAMS = {"total_programs": 0, "created": 0, "updated": 0, "errors": []}
_EMPTY_ATHLETES = {"total_athletes": 0, "created": 0, "updated": 0, "errors": []}


def sync_all(db: Session) -> dict:
    """Sync every enabled category in one shot.

    Reads the per-instance ``gcal_sync_options`` toggles to decide which
    categories to run. Disabled categories return zeroed counts so the
    route response shape is stable for the frontend regardless of which
    toggles are on. Either side raising bubbles up so the route can map
    RuntimeError -> 401 (re-auth) consistently.
    """
    options = client.get_sync_options(db=db)

    meets_result = sync_all_meets(db) if options.get("meets") else dict(_EMPTY_MEETS)
    programs_result = (
        sync_all_programs(db) if options.get("programs") else dict(_EMPTY_PROGRAMS)
    )
    availability_result = (
        sync_all_availability(db)
        if options.get("availability")
        else dict(_EMPTY_ATHLETES)
    )
    birthdays_result = (
        sync_all_birthdays(db)
        if options.get("birthdays")
        else dict(_EMPTY_ATHLETES)
    )

    return {
        "meets": meets_result,
        "programs": programs_result,
        "availability": availability_result,
        "birthdays": birthdays_result,
    }
