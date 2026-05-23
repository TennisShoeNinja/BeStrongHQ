"""An RPE logged above 10 means "I don't trust this number," not "made max."

The parser already flags such sets (rpe_needs_review=True) and keeps the raw
value. These tests lock in that flagged sets:

  * never set a PR or bump a declared max during import (pr_tracking),
  * never floor a cached max (max_tracking.floor_declared_maxes_to_history),
  * get cleaned up by the repair-flagged-maxes CLI command, which demotes a
    cached max that a flagged single had previously inflated.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.api.routes_notifications import _generate_rpe_review_flags
from bestrong.models.orm import (
    Athlete,
    Base,
    ExerciseEntry,
    MaxHistory,
    Notification,
    Program,
    Session as SessionModel,
)
from bestrong.services.max_tracking import floor_declared_maxes_to_history
from bestrong.services.pr_tracking import log_prs_for_program


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    s = factory()
    yield s
    s.close()


def _program(session, athlete_id: int, number: int = 1) -> Program:
    prog = Program(
        athlete_id=athlete_id,
        program_number=number,
        program_name=f"Program {number}",
        date_start="2026-01-01",
        date_end="2026-02-01",
    )
    session.add(prog)
    session.flush()
    return prog


def _single(
    session,
    program: Program,
    weight: float,
    *,
    week: int = 1,
    day: int = 1,
    lift: str = "bench",
    exercise: str = "Competition Bench Press",
    needs_review: bool = False,
    raw_rpe: str | None = None,
) -> ExerciseEntry:
    sess = SessionModel(
        program_id=program.id, week_number=week, day_number=day, day_name=f"Day {day}"
    )
    session.add(sess)
    session.flush()
    entry = ExerciseEntry(
        session_id=sess.id,
        exercise_name=exercise,
        exercise_order=1,
        exercise_group=1,
        set_type="top_set",
        lift_category=lift,
        sets=1,
        reps=1,
        weight_lbs=weight,
        is_accessory=False,
        failed=False,
        rpe_needs_review=needs_review,
        rpe_raw_value=raw_rpe,
    )
    session.add(entry)
    session.flush()
    return entry


def test_flagged_single_does_not_set_declared_max(session):
    """A 353x1 logged at RPE 10.5 must not become the bench max; the legit
    320x1 single is the heaviest trustworthy made single."""
    athlete = Athlete(name="Jonathan Eppler")
    session.add(athlete)
    session.flush()

    prog = _program(session, athlete.id)
    _single(session, prog, 320.0, day=1)
    _single(session, prog, 353.0, day=2, needs_review=True, raw_rpe="10.5")
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=prog.id, source="import")
    session.commit()

    assert athlete.bench_max_lbs == 320.0
    bench_history = (
        session.query(MaxHistory.new_value)
        .filter(MaxHistory.athlete_id == athlete.id, MaxHistory.lift == "bench")
        .all()
    )
    values = {v for (v,) in bench_history}
    assert 353.0 not in values
    assert 320.0 in values


def test_floor_ignores_flagged_single(session):
    """floor_declared_maxes_to_history must not lift a cached max to a flagged
    single's weight."""
    athlete = Athlete(name="Floor Case", bench_max_lbs=300.0)
    session.add(athlete)
    session.flush()

    prog = _program(session, athlete.id)
    _single(session, prog, 320.0, day=1)
    _single(session, prog, 353.0, day=2, needs_review=True, raw_rpe="11")
    session.commit()

    floor_declared_maxes_to_history(session, athlete, source="test")
    session.commit()

    assert athlete.bench_max_lbs == 320.0


def test_rpe_review_flag_is_generated_once(session):
    """A flagged set opens one rpe_review notification per athlete, and the
    generator is idempotent while that notification stays open."""
    athlete = Athlete(name="Jonathan Eppler", archived=False)
    session.add(athlete)
    session.flush()
    prog = _program(session, athlete.id)
    _single(session, prog, 320.0, day=1)
    _single(session, prog, 353.0, day=2, needs_review=True, raw_rpe="10.5")
    session.commit()

    _generate_rpe_review_flags(session)
    _generate_rpe_review_flags(session)

    notifs = (
        session.query(Notification)
        .filter(Notification.notification_type == "rpe_review")
        .all()
    )
    assert len(notifs) == 1
    assert notifs[0].athlete_id == athlete.id
    assert "RPE 10" in (notifs[0].message or "")


def test_no_flag_without_flagged_sets(session):
    """No rpe_review notification when every set is in-range."""
    athlete = Athlete(name="Clean Logger", archived=False)
    session.add(athlete)
    session.flush()
    prog = _program(session, athlete.id)
    _single(session, prog, 320.0, day=1)
    session.commit()

    _generate_rpe_review_flags(session)

    assert (
        session.query(Notification)
        .filter(Notification.notification_type == "rpe_review")
        .count()
        == 0
    )


def test_repair_demotes_inflated_max(tmp_path):
    """The repair command finds a max backed by a flagged single and demotes
    it to real evidence, dropping the stale auto-generated PR row."""
    from bestrong.cli import repair_flagged_maxes
    from bestrong.models.database import get_session, init_db

    db_path = tmp_path / "repair.db"
    init_db(db_path)

    seed = get_session(db_path)
    athlete = Athlete(
        name="Jonathan Eppler",
        squat_max_lbs=500.0,
        bench_max_lbs=353.0,
        deadlift_max_lbs=600.0,
        total_lbs=1453.0,
    )
    seed.add(athlete)
    seed.flush()
    prog = _program(seed, athlete.id)
    _single(seed, prog, 500.0, day=1, lift="squat", exercise="Competition Squat")
    _single(seed, prog, 320.0, day=2, lift="bench")
    _single(seed, prog, 353.0, day=3, lift="bench", needs_review=True, raw_rpe="10.5")
    _single(seed, prog, 600.0, day=4, lift="deadlift", exercise="Competition Deadlift")
    # The stale auto-PR row that the flagged single created before the fix.
    seed.add(
        MaxHistory(
            athlete_id=athlete.id,
            lift="bench",
            old_value=320.0,
            new_value=353.0,
            source="import",
            reps=1,
            exercise_name="Competition Bench Press",
        )
    )
    seed.commit()
    athlete_id = athlete.id
    seed.close()

    repair_flagged_maxes(db=db_path, apply=True, yes=True)

    check = get_session(db_path)
    refreshed = check.query(Athlete).filter(Athlete.id == athlete_id).first()
    assert refreshed.bench_max_lbs == 320.0
    assert refreshed.total_lbs == 1420.0
    leftover = (
        check.query(MaxHistory)
        .filter(MaxHistory.lift == "bench", MaxHistory.new_value == 353.0)
        .count()
    )
    assert leftover == 0
    check.close()
