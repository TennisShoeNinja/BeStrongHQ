"""Import service — takes parsed ProgramData and writes it to the database."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session as DBSession

from ..models.database import get_session, init_db
from ..models.orm import Athlete, DailyWellness, ExerciseEntry, Program, Session, WeeklyVolume
from ..parser.adapters import ProgramData
from ..parser.pipeline import parse_file


def _resolve_parser_id(db: DBSession | None, db_path: str | Path | None) -> str | None:
    """Look up a configured parser_id via an optional sibling registry.

    Returns ``None`` when the registry is absent or when the path doesn't
    match a registered entry. Callers should treat ``None`` as "use
    auto-detection".
    """
    try:
        from bestrong_cloud.registry import lookup_tenant_by_db_path
    except ModuleNotFoundError:
        return None

    resolved_path: str | None = None
    if db_path is not None:
        resolved_path = str(db_path)
    elif db is not None:
        try:
            url = db.get_bind().url
            resolved_path = url.database
        except Exception:
            resolved_path = None

    if not resolved_path:
        return None

    record = lookup_tenant_by_db_path(resolved_path)
    return record.parser_id if record else None


resolve_parser_id = _resolve_parser_id


class EmptyParserOutputError(ValueError):
    """Raised when the parser produced sessions but extracted zero exercises.

    Strong signal the workbook isn't a recognized program (e.g., an old format
    from a different coach, a meet-day attempt sheet, or a blank template).
    Aborts the import before any Athlete/Program rows are created so a junk
    file never lands a phantom athlete derived from the filename.
    """


def import_file(
    path: str | Path,
    db_path: str | Path | None = None,
    program_number: int | None = None,
    title: str | None = None,
    athlete_name: str | None = None,
    existing_program_id: int | None = None,
    db: DBSession | None = None,
    parser_id: str | None = None,
) -> dict:
    """Parse an xlsx file and import it into the database.

    Args:
        path: Path to the xlsx file.
        db_path: Optional database path (defaults to ~/.bestrong/bestrong.db).
                 Ignored when ``db`` is supplied.
        program_number: Override the program number (if filename parsing fails).
        title: The real title from Google Drive (e.g., "Ed's Program 35 -- (02/01/26 -- 02/22/26) -- Strength Block").
               When provided, this is used instead of the filename for metadata extraction.
        athlete_name: Override the athlete name (e.g., from the Google Drive folder name).
                      This takes precedence over filename-derived names.
        existing_program_id: If provided, directly update this program instead of
                             matching by program_number. Used by resync to guarantee
                             the correct program is updated.
        db: Optional outer SQLAlchemy session. When provided, the caller owns
            the transaction lifecycle (commit/rollback/close). Used by Drive
            sync so the Program insert and the gdrive_imports audit row land
            in a single atomic transaction. When omitted, a self-managed
            session is opened/committed/closed internally (CLI usage).

    Returns:
        Dict with import summary info.
    """


    candidate_name = (title or Path(path).name).strip()
    if candidate_name.lower().startswith("copy of "):
        return {
            "skipped": True,
            "reason": "copy_of_filename",
            "source_filename": candidate_name,
        }


    if parser_id is None:
        parser_id = _resolve_parser_id(db, db_path)


    program_data = parse_file(path, parser_id=parser_id)

    # Resolve the adapter once and reuse for the title re-extract and the
    # multi-program dispatch below.
    adapter = None
    wb = None
    if title or _adapter_may_be_multi(parser_id):
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True)
        from ..parser.adapters import find_adapter, find_adapter_by_id
        adapter = (
            find_adapter_by_id(parser_id) if parser_id is not None else find_adapter(wb)
        )

    if title and adapter is not None:
        program_data = adapter.extract(wb, filename=title + ".xlsx")

    # Capability dispatch: an adapter may expose ``extract_all`` to yield
    # multiple Program records from a single workbook (e.g. when each tab
    # is a separate program). Adapters without the method stay on the
    # legacy single-program path untouched.
    #
    # ``program_number`` overrides force a single-record interpretation
    # (CLI flag), so we still suppress multi-extract there. ``existing_program_id``
    # used to suppress too — that broke resync of multi-program workbooks
    # because only the targeted block got refreshed while the others went
    # stale. We now run multi-extract anyway and use existing_program_id
    # purely to pick the headline result for the response.
    multi_extract = (
        adapter is not None
        and hasattr(adapter, "extract_all")
        and program_number is None
    )
    if multi_extract:
        if wb is None:
            import openpyxl
            wb = openpyxl.load_workbook(path, data_only=True)
        ext_filename = (title + ".xlsx") if title else Path(path).name
        program_data_list = adapter.extract_all(wb, filename=ext_filename)
        # Fall back to the single-program path when extract_all returns
        # 0 or 1 programs — preserves error semantics
        # (EmptyParserOutputError) and the existing return shape.
        if len(program_data_list) > 1:
            return _import_many(
                program_data_list,
                source_filename=title or Path(path).name,
                athlete_name=athlete_name,
                db=db,
                db_path=db_path,
                candidate_name=candidate_name,
                targeted_program_id=existing_program_id,
            )

    if program_number is not None:
        program_data.program_number = program_number

    _apply_athlete_name_override(program_data, athlete_name)

    total_exercises = sum(len(s.exercises) for s in program_data.sessions)
    if program_data.sessions and total_exercises == 0:
        raise EmptyParserOutputError(
            f"Parsed {len(program_data.sessions)} sessions but zero exercises "
            f"from {candidate_name!r}; not a recognized program."
        )

    source_filename = title or Path(path).name


    if db is not None:
        return _write_to_db(
            db, program_data,
            source_filename=source_filename,
            existing_program_id=existing_program_id,
        )


    init_db(db_path)
    owned_db = get_session(db_path)
    try:
        result = _write_to_db(
            owned_db, program_data,
            source_filename=source_filename,
            existing_program_id=existing_program_id,
        )
        owned_db.commit()
        return result
    except Exception:
        owned_db.rollback()
        raise
    finally:
        owned_db.close()


def _adapter_may_be_multi(parser_id: str | None) -> bool:
    """Cheap pre-check: load the workbook only when the adapter could be
    multi-program. Avoids opening every workbook twice for the public
    one-program adapters.
    """
    if parser_id is None:
        # Unknown parser: assume single-program. Auto-detect path runs
        # ``parse_file`` which already chose an adapter; the only way to
        # reach extract_all from auto-detect is to re-resolve, which the
        # caller does explicitly via ``title``.
        return False
    try:
        from ..parser.adapters import find_adapter_by_id
    except ImportError:
        return False
    adapter = find_adapter_by_id(parser_id)
    return adapter is not None and hasattr(adapter, "extract_all")


def _apply_athlete_name_override(
    program_data: ProgramData, athlete_name: str | None
) -> None:
    if not (athlete_name and athlete_name.strip()):
        return
    override = athlete_name.strip()
    parsed = (program_data.athlete.name or "").strip()
    if not parsed:
        program_data.athlete.name = override
        return
    override_lc = override.lower()
    parsed_lc = parsed.lower()
    keep_parsed = (
        parsed_lc == override_lc
        or parsed_lc.startswith(override_lc + " ")
        or (len(parsed) > len(override) and override_lc in parsed_lc)
    )
    if not keep_parsed:
        program_data.athlete.name = override


def _import_many(
    program_data_list: list[ProgramData],
    *,
    source_filename: str,
    athlete_name: str | None,
    db: DBSession | None,
    db_path: str | Path | None,
    candidate_name: str,
    targeted_program_id: int | None = None,
) -> dict:
    """Write multiple ProgramData records from one workbook.

    Each record is upserted via ``_write_to_db`` under the same db
    transaction (atomic per workbook). Returns an aggregated summary
    plus the per-program write results under ``programs``.

    ``targeted_program_id`` is the resync caller's "this is the program I
    care about" hint. When matched in the written list, it becomes the
    headline result so the resync response refers to the program the
    caller asked for, even though every block in the workbook was
    refreshed atomically.
    """
    if db is not None:
        return _write_many(
            db, program_data_list,
            source_filename=source_filename,
            athlete_name=athlete_name,
            candidate_name=candidate_name,
            targeted_program_id=targeted_program_id,
        )

    init_db(db_path)
    owned_db = get_session(db_path)
    try:
        result = _write_many(
            owned_db, program_data_list,
            source_filename=source_filename,
            athlete_name=athlete_name,
            candidate_name=candidate_name,
            targeted_program_id=targeted_program_id,
        )
        owned_db.commit()
        return result
    except Exception:
        owned_db.rollback()
        raise
    finally:
        owned_db.close()


def _write_many(
    db: DBSession,
    program_data_list: list[ProgramData],
    *,
    source_filename: str,
    athlete_name: str | None,
    candidate_name: str,
    targeted_program_id: int | None = None,
) -> dict:
    written: list[dict] = []
    for program_data in program_data_list:
        _apply_athlete_name_override(program_data, athlete_name)
        total_exercises = sum(len(s.exercises) for s in program_data.sessions)
        if program_data.sessions and total_exercises == 0:
            raise EmptyParserOutputError(
                f"Parsed {len(program_data.sessions)} sessions but zero "
                f"exercises from {candidate_name!r}; not a recognized program."
            )
        result = _write_to_db(
            db, program_data,
            source_filename=source_filename,
            existing_program_id=None,
        )
        written.append(result)

    if not written:
        # Multi-extract returned a non-empty list but every entry was
        # filtered out — surface as EmptyParserOutputError so callers
        # treat it like the single-program empty case.
        raise EmptyParserOutputError(
            f"extract_all yielded no usable programs from {candidate_name!r}."
        )

    headline = written[-1]  # latest block by default
    if targeted_program_id is not None:
        for r in written:
            if r.get("program_id") == targeted_program_id:
                headline = r
                break

    program_ids = [r["program_id"] for r in written if r.get("program_id")]
    return {
        "athlete_name": headline["athlete_name"],
        "athlete_id": headline["athlete_id"],
        "athlete_created": any(r.get("athlete_created") for r in written),
        "program_id": headline["program_id"],
        "program_name": headline["program_name"],
        "program_updated": any(r.get("program_updated") for r in written),
        "sessions_imported": sum(r.get("sessions_imported", 0) for r in written),
        "exercises_imported": sum(r.get("exercises_imported", 0) for r in written),
        "days_fixed": sum(r.get("days_fixed", 0) for r in written),
        "wellness_entries": sum(r.get("wellness_entries", 0) for r in written),
        "prs_logged": sum(r.get("prs_logged", 0) for r in written),
        "programs": written,
        "program_ids": program_ids,
    }


def _build_program_display_name(
    athlete_name: str | None,
    program_number: int | None,
    date_start: str | None,
    date_end: str | None,
    theme: str | None,
) -> str:
    """Build a display-friendly program name from parsed components.

    Full format: "Name's Program ## -- (start - end) -- Theme"
    Falls back gracefully when parts are missing.
    """
    parts = []
    if athlete_name and program_number is not None:
        parts.append(f"{athlete_name}'s Program {program_number}")
    elif program_number is not None:
        parts.append(f"Program {program_number}")

    if date_start and date_end:
        parts.append(f"({date_start} - {date_end})")

    if theme:
        parts.append(theme)

    if parts:
        return " -- ".join(parts)


    return theme or "Untitled Program"


def _fix_duplicate_day3_sessions(db: DBSession, program_id: int) -> int:
    """Fix sessions where Day 3 appears twice but Day 4 is missing.

    For each week in the program, if there are multiple Day 3 sessions
    but no Day 4, the second batch (by ID) gets renumbered to Day 4.

    Returns the number of sessions fixed.
    """
    from collections import defaultdict

    sessions = (
        db.query(Session)
        .filter(Session.program_id == program_id)
        .order_by(Session.id)
        .all()
    )


    weeks: dict[int, list[Session]] = defaultdict(list)
    for s in sessions:
        weeks[s.week_number].append(s)


    day4_name = "Day 4"
    for s in sessions:
        if s.day_number == 4 and s.day_name:
            day4_name = s.day_name
            break

    fixed = 0
    for week_num, week_sessions in weeks.items():
        day3s = [s for s in week_sessions if s.day_number == 3]
        has_day4 = any(s.day_number == 4 for s in week_sessions)

        if len(day3s) > 1 and not has_day4:

            mid = len(day3s) // 2
            for s in day3s[mid:]:
                s.day_number = 4
                s.day_name = day4_name
                fixed += 1

    return fixed


def _compute_wellness_date(
    date_start: str | None, week_number: int, day_of_week: str
) -> str | None:
    """Compute an actual date for a wellness entry from program start date + week/day.

    Args:
        date_start: Program start date in MM/DD/YY or MM/DD/YYYY format.
        week_number: 1-based week number.
        day_of_week: Day name like "Monday", "Tuesday", etc.

    Returns:
        ISO date string (YYYY-MM-DD) or None if date_start is unavailable.
    """
    if not date_start:
        return None

    from datetime import datetime, timedelta


    for fmt in ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            start = datetime.strptime(date_start, fmt)
            break
        except ValueError:
            continue
    else:
        return None


    day_map = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
        "Friday": 4, "Saturday": 5, "Sunday": 6,
    }
    target_weekday = day_map.get(day_of_week)
    if target_weekday is None:
        return None


    start_weekday = start.weekday()
    week1_monday = start - timedelta(days=start_weekday)


    target_date = week1_monday + timedelta(weeks=week_number - 1, days=target_weekday)

    return target_date.strftime("%Y-%m-%d")


def _write_to_db(
    db: DBSession,
    data: ProgramData,
    source_filename: str = "",
    existing_program_id: int | None = None,
) -> dict:
    """Write parsed program data to the database.

    Handles upsert logic for athletes and programs.
    If existing_program_id is provided, that program is updated directly
    (used by resync). Otherwise, matches by athlete_id + program_number.
    """


    athlete = db.query(Athlete).filter(Athlete.name == data.athlete.name).first()
    if athlete is None:
        from sqlalchemy import func
        athlete = (
            db.query(Athlete)
            .filter(func.lower(func.trim(Athlete.name)) == data.athlete.name.strip().lower())
            .first()
        )
    created_athlete = False

    if athlete is None:


        athlete = Athlete(
            name=data.athlete.name,
            goal=data.athlete.goal,
            next_meet_date=data.athlete.next_meet_date,
        )
        db.add(athlete)
        db.flush()
        created_athlete = True
        max_updates = {}
        if data.athlete.squat_max_lbs is not None:
            max_updates["squat_max_lbs"] = data.athlete.squat_max_lbs
        if data.athlete.bench_max_lbs is not None:
            max_updates["bench_max_lbs"] = data.athlete.bench_max_lbs
        if data.athlete.deadlift_max_lbs is not None:
            max_updates["deadlift_max_lbs"] = data.athlete.deadlift_max_lbs
        if data.athlete.total_lbs is not None:
            max_updates["total_lbs"] = data.athlete.total_lbs
    else:


        max_updates: dict[str, float] = {}
        if data.athlete.squat_max_lbs is not None:
            max_updates["squat_max_lbs"] = data.athlete.squat_max_lbs
        if data.athlete.bench_max_lbs is not None:
            max_updates["bench_max_lbs"] = data.athlete.bench_max_lbs
        if data.athlete.deadlift_max_lbs is not None:
            max_updates["deadlift_max_lbs"] = data.athlete.deadlift_max_lbs
        if data.athlete.total_lbs is not None:
            max_updates["total_lbs"] = data.athlete.total_lbs

        if data.athlete.goal:
            athlete.goal = data.athlete.goal
        if data.athlete.next_meet_date:
            athlete.next_meet_date = data.athlete.next_meet_date


    if data.primary_squat_day is not None:
        athlete.primary_squat_day = data.primary_squat_day
    if data.primary_bench_day is not None:
        athlete.primary_bench_day = data.primary_bench_day
    if data.primary_deadlift_day is not None:
        athlete.primary_deadlift_day = data.primary_deadlift_day


    display_name = _build_program_display_name(
        athlete_name=data.athlete.name,
        program_number=data.program_number,
        date_start=data.date_start,
        date_end=data.date_end,
        theme=data.program_name,
    )


    program_updated = False
    program = None

    if existing_program_id is not None:
        program = db.query(Program).filter(Program.id == existing_program_id).first()
    elif data.program_number is not None:
        program = (
            db.query(Program)
            .filter(
                Program.athlete_id == athlete.id,
                Program.program_number == data.program_number,
            )
            .first()
        )

    if program is not None:

        program.program_name = display_name
        program.date_start = data.date_start
        program.date_end = data.date_end
        program.block_type = data.block_type
        program.source_filename = source_filename
        program_updated = True


        session_ids = [s.id for s in db.query(Session.id).filter(Session.program_id == program.id).all()]
        if session_ids:
            db.query(ExerciseEntry).filter(ExerciseEntry.session_id.in_(session_ids)).delete(synchronize_session="fetch")
        db.query(Session).filter(Session.program_id == program.id).delete(synchronize_session="fetch")
        db.query(WeeklyVolume).filter(WeeklyVolume.program_id == program.id).delete(synchronize_session="fetch")
        db.query(DailyWellness).filter(DailyWellness.program_id == program.id).delete(synchronize_session="fetch")
    else:

        program = Program(
            athlete_id=athlete.id,
            program_number=data.program_number,
            program_name=display_name,
            date_start=data.date_start,
            date_end=data.date_end,
            block_type=data.block_type,
            source_filename=source_filename,
        )
        db.add(program)

    db.flush()


    session_count = 0
    exercise_count = 0

    for session_data in data.sessions:
        info = session_data.info
        session = Session(
            program_id=program.id,
            week_number=info.week_number,
            day_number=info.day_number,
            day_name=info.day_name,
            session_label=info.session_label,
            nutrition_rating=info.nutrition_rating,
            stress_rating=info.stress_rating,
            sleep_rating=info.sleep_rating,
            fatigue_rating=info.fatigue_rating,
        )
        db.add(session)
        db.flush()
        session_count += 1

        for ex_data in session_data.exercises:
            entry = ExerciseEntry(
                session_id=session.id,
                exercise_name=ex_data.exercise_name,
                exercise_order=ex_data.exercise_order,
                exercise_group=ex_data.exercise_group,
                set_type=ex_data.set_type,
                lift_category=ex_data.lift_category,
                sets=ex_data.sets,
                reps=ex_data.reps,
                weight_lbs=ex_data.weight_lbs,
                target_rpe=ex_data.target_rpe,
                actual_rpe=ex_data.actual_rpe,
                volume=ex_data.volume,
                is_accessory=ex_data.is_accessory,
                failed=ex_data.failed,
                notes=ex_data.notes,
                weight_expected=ex_data.weight_expected,
                rpe_expected=ex_data.rpe_expected,
                rpe_needs_review=ex_data.rpe_needs_review,
                rpe_raw_value=ex_data.rpe_raw_value,
            )
            db.add(entry)
            exercise_count += 1


    for week_num, vols in data.weekly_volume.items():
        wv = WeeklyVolume(
            program_id=program.id,
            week_number=week_num,
            squat_volume=vols.get("squat"),
            bench_volume=vols.get("bench"),
            deadlift_volume=vols.get("deadlift"),
        )
        db.add(wv)


    wellness_count = 0
    for entry in data.daily_wellness:
        computed_date = _compute_wellness_date(
            data.date_start, entry.week_number, entry.day_of_week
        )
        if computed_date is None:

            continue
        dw = DailyWellness(
            athlete_id=athlete.id,
            program_id=program.id,
            date=computed_date,
            week_number=entry.week_number,
            day_of_week=entry.day_of_week,
            goal_calories=entry.goal_calories,
            goal_protein=entry.goal_protein,
            goal_carbs=entry.goal_carbs,
            goal_fat=entry.goal_fat,
            actual_calories=entry.actual_calories,
            actual_protein=entry.actual_protein,
            actual_carbs=entry.actual_carbs,
            actual_fat=entry.actual_fat,
            bodyweight_lbs=entry.bodyweight_lbs,
        )
        db.add(dw)
        wellness_count += 1


    days_fixed = _fix_duplicate_day3_sessions(db, program.id)


    db.flush()
    from .pr_tracking import log_prs_for_program
    prs_logged = log_prs_for_program(
        db,
        athlete_id=athlete.id,
        program_id=program.id,
        source="resync" if program_updated else "import",
    )


    # Monotonic: a header value typed at the top of the workbook is the
    # program's starting max, not a live total. PR detection above may have
    # already raised the athlete's max from imported top sets; never let a
    # stale header value lower it.
    for field, val in max_updates.items():
        if val is None:
            continue
        current = getattr(athlete, field, None) or 0
        if val > current:
            setattr(athlete, field, val)

    # PR detection only fires on strict greater-than, so a tied training
    # rep can't lift a cached max that fell behind history (e.g. coach
    # manually lowered bench to match a comp result, then athlete hits the
    # old training PR weight again). Floor the cached max up to the best
    # 1-rep evidence in max_history so the invariant holds after every
    # import.
    from .max_tracking import floor_declared_maxes_to_history
    floor_declared_maxes_to_history(
        db, athlete, source="floor_history", note=program.program_name
    )

    return {
        "athlete_name": athlete.name,
        "athlete_id": athlete.id,
        "athlete_created": created_athlete,
        "program_id": program.id,
        "program_name": program.program_name,
        "program_updated": program_updated,
        "sessions_imported": session_count,
        "exercises_imported": exercise_count,
        "days_fixed": days_fixed,
        "wellness_entries": wellness_count,
        "prs_logged": prs_logged,
    }
