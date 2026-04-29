"""Regression tests for pr_tracking.log_prs_for_program.

The session factory uses ``autoflush=False`` so PR-tracking has to flush
its own pending writes before re-reading max_history. Without that, batch
runs (backfill-prs) see stale committed state and re-issue PRs that the
prior program already set.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.models.orm import (
    Athlete,
    Base,
    ExerciseAlias,
    ExerciseEntry,
    MaxHistory,
    Program,
    Session as SessionModel,
)
from bestrong.services.pr_tracking import log_prs_for_program


@pytest.fixture()
def session():
    """In-memory DB with the production autoflush=False semantics."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    s = factory()
    yield s
    s.close()


def _make_program(session, athlete_id: int, program_number: int, date_start: str) -> Program:
    prog = Program(
        athlete_id=athlete_id,
        program_number=program_number,
        program_name=f"Program {program_number}",
        date_start=date_start,
        date_end=date_start,
    )
    session.add(prog)
    session.flush()
    return prog


def _make_top_set(
    session,
    program: Program,
    week: int,
    day: int,
    weight: float,
    reps: int = 3,
    exercise: str = "Competition Squat",
    lift_category: str = "squat",
):
    sess = SessionModel(
        program_id=program.id,
        week_number=week,
        day_number=day,
        day_name=f"Day {day}",
    )
    session.add(sess)
    session.flush()
    entry = ExerciseEntry(
        session_id=sess.id,
        exercise_name=exercise,
        exercise_order=1,
        exercise_group=1,
        set_type="top_set",
        lift_category=lift_category,
        sets=1,
        reps=reps,
        weight_lbs=weight,
    )
    session.add(entry)
    session.flush()


def test_chain_holds_across_programs_without_commits(session):
    """log_prs_for_program must see prior calls' writes even without commits.

    Backfill-prs walks every program in one session and only commits every
    50 iterations. With autoflush=False, a naive implementation would let
    each program's _current_rep_prs read stale committed state and re-issue
    PRs that an earlier program in the same batch had already set.

    Reproduces by walking three programs in one session: P1 establishes
    240, P2 hits 240 again (no PR — tied), P3 hits 245 (PR of +5 over
    240, NOT +9 over the original 236 baseline).
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()


    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    _make_top_set(session, p1, week=1, day=1, weight=240.0)
    p2 = _make_program(session, athlete.id, program_number=2, date_start="2025-02-01")
    _make_top_set(session, p2, week=1, day=1, weight=240.0)
    p3 = _make_program(session, athlete.id, program_number=3, date_start="2025-03-01")
    _make_top_set(session, p3, week=1, day=1, weight=245.0)
    session.commit()


    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p2.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p3.id, source="import")

    session.flush()
    rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "squat")
        .filter(MaxHistory.reps == 3)
        .order_by(MaxHistory.recorded_at)
        .all()
    )

    assert len(rows) == 2, (
        f"expected 2 PRs (P1 establishing 240, P3 beating with 245); got {len(rows)} "
        f"with values {[(r.old_value, r.new_value) for r in rows]}"
    )

    p1_row, p3_row = rows
    assert p1_row.old_value is None and p1_row.new_value == 240.0
    assert p3_row.old_value == 240.0 and p3_row.new_value == 245.0, (
        f"P3 should chain from P1's 240, not seed from None or a stale baseline. "
        f"Got old={p3_row.old_value}, new={p3_row.new_value}"
    )


def test_spelling_variants_collapse_to_one_pr_lane(session):
    """Paused Squat / Paused Squats / Tempo Sqaut must share a PR lane.

    Coaches enter free text in the spreadsheet, so the same lift shows
    up with different casing, pluralization, and occasional typos. PR
    tracking groups by canonical name so 240 on "Paused Squat" and 238
    on "Paused Squats" don't produce two parallel PR lanes.
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()

    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    _make_top_set(session, p1, week=1, day=1, weight=240.0, exercise="Paused Squat (0-1-0)")
    p2 = _make_program(session, athlete.id, program_number=2, date_start="2025-02-01")


    _make_top_set(session, p2, week=1, day=1, weight=238.0, exercise="Paused Squats (0-1-0)")
    p3 = _make_program(session, athlete.id, program_number=3, date_start="2025-03-01")

    _make_top_set(session, p3, week=1, day=1, weight=250.0, exercise="Paused Sqaut (0-1-0)")
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p2.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p3.id, source="import")

    session.flush()
    rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "squat")
        .filter(MaxHistory.reps == 3)
        .order_by(MaxHistory.recorded_at)
        .all()
    )
    assert len(rows) == 2, (
        "P2's lighter 238 under a plural spelling must not register as a new PR. "
        f"Got {[(r.exercise_name, r.old_value, r.new_value) for r in rows]}"
    )


    assert rows[0].exercise_name == "Paused Squat (0-1-0)"
    assert rows[1].exercise_name == "Paused Sqaut (0-1-0)"
    assert rows[1].old_value == 240.0 and rows[1].new_value == 250.0


def test_coach_declared_aliases_fold_into_one_pr_lane(session):
    """Coach-managed aliases merge names that structural fold can't.

    The structural canonicalizer intentionally preserves parenthetical
    cues ("just off the floor" vs "right off the floor") because those
    can be real distinctions. When the coach declares two such variants
    equivalent via the exercise_aliases table, PR tracking must honor
    that and fold them into a single lane.
    """
    athlete = Athlete(name="Test Athlete")
    session.add(athlete)
    session.flush()


    session.add_all([
        ExerciseAlias(
            primary_name="Paused Deadlift",
            alias_name="Pause Deadlift 0-1-0 (just off the floor)",
        ),
        ExerciseAlias(
            primary_name="Paused Deadlift",
            alias_name="Paused Deadlift (0-1-0) (right off the floor)",
        ),
    ])

    p1 = _make_program(session, athlete.id, program_number=1, date_start="2025-01-01")
    _make_top_set(
        session, p1, week=1, day=1, weight=480.0,
        exercise="Pause Deadlift 0-1-0 (just off the floor)",
        lift_category="deadlift",
    )
    p2 = _make_program(session, athlete.id, program_number=2, date_start="2025-02-01")


    _make_top_set(
        session, p2, week=1, day=1, weight=495.0,
        exercise="Paused Deadlift (0-1-0) (right off the floor)",
        lift_category="deadlift",
    )
    session.commit()

    log_prs_for_program(session, athlete_id=athlete.id, program_id=p1.id, source="import")
    log_prs_for_program(session, athlete_id=athlete.id, program_id=p2.id, source="import")

    session.flush()
    rows = (
        session.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id)
        .filter(MaxHistory.lift == "deadlift")
        .filter(MaxHistory.reps == 3)
        .order_by(MaxHistory.recorded_at)
        .all()
    )
    assert len(rows) == 2, (
        "Coach-declared aliases should chain the two variants. "
        f"Got {[(r.exercise_name, r.old_value, r.new_value) for r in rows]}"
    )


    assert rows[0].old_value is None and rows[0].new_value == 480.0
    assert rows[1].old_value == 480.0 and rows[1].new_value == 495.0

    assert rows[0].exercise_name == "Pause Deadlift 0-1-0 (just off the floor)"
    assert rows[1].exercise_name == "Paused Deadlift (0-1-0) (right off the floor)"
