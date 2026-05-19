"""Tests for block-level PR event derivation."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.api.routes_analytics import get_athlete_pr_events
from bestrong.analytics.pr_events import PRSetInput, derive_pr_events
from bestrong.models.orm import Athlete, Base, ExerciseEntry, Program
from bestrong.models.orm import Session as SessionModel


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = factory()
    yield session
    session.close()


def _set(
    *,
    program_id: int,
    weight_lbs: float,
    exercise_name: str = "Competition Squat",
    lift_category: str = "squat",
    reps: int = 3,
    program_number: int | None = None,
    date_start: str | None = None,
) -> PRSetInput:
    return PRSetInput(
        exercise_name=exercise_name,
        lift_category=lift_category,
        weight_lbs=weight_lbs,
        reps=reps,
        actual_rpe=None,
        failed=False,
        program_id=program_id,
        program_name=f"Program {program_id}",
        program_number=program_number if program_number is not None else program_id,
        date_start=date_start or f"2026-0{program_id}-01",
        imported_at=datetime(2026, program_id, 2),
    )


def test_debut_block_excluded():
    events = derive_pr_events(
        [
            _set(program_id=1, weight_lbs=300.0),
            _set(program_id=1, weight_lbs=310.0),
        ]
    )

    assert events == []


def test_in_block_multi_improvement_collapses_to_one_pr():
    events = derive_pr_events(
        [
            _set(program_id=1, weight_lbs=300.0),
            _set(program_id=2, weight_lbs=305.0),
            _set(program_id=2, weight_lbs=315.0),
            _set(program_id=2, weight_lbs=320.0),
        ]
    )

    assert len(events) == 1
    event = events[0]
    assert event.program_id == 2
    assert event.program_number == 2
    assert event.e1rm == 352.0
    assert event.prev_best_e1rm == 330.0
    assert event.delta == 22.0


def test_regression_block_yields_zero_events():
    events = derive_pr_events(
        [
            _set(program_id=1, weight_lbs=300.0),
            _set(program_id=2, weight_lbs=320.0),
            _set(program_id=3, weight_lbs=310.0),
        ]
    )

    assert [event.program_id for event in events] == [2]
    assert all(event.program_id != 3 for event in events)


def test_sets_above_rep_cap_do_not_count():
    events = derive_pr_events(
        [
            _set(program_id=1, weight_lbs=300.0),
            _set(program_id=2, weight_lbs=400.0, reps=9),
        ]
    )

    assert events == []


def test_competition_and_variation_split():
    events = derive_pr_events(
        [
            _set(
                program_id=1,
                weight_lbs=200.0,
                exercise_name="Bench Press",
                lift_category="bench",
            ),
            _set(
                program_id=2,
                weight_lbs=210.0,
                exercise_name="Bench Press",
                lift_category="bench",
            ),
            _set(
                program_id=1,
                weight_lbs=180.0,
                exercise_name="Close Grip Bench",
                lift_category="bench",
            ),
            _set(
                program_id=2,
                weight_lbs=190.0,
                exercise_name="Close Grip Bench",
                lift_category="bench",
            ),
        ]
    )

    by_variation = {event.variation_canon: event for event in events}
    assert set(by_variation) == {"bench press", "close grip bench"}
    assert by_variation["bench press"].is_competition is True
    assert by_variation["close grip bench"].is_competition is False


def test_pr_events_route_returns_events(db_session):
    athlete = Athlete(name="Route Athlete")
    db_session.add(athlete)
    db_session.flush()

    first = Program(
        athlete_id=athlete.id,
        program_number=1,
        program_name="Baseline",
        date_start="2026-01-01",
    )
    second = Program(
        athlete_id=athlete.id,
        program_number=2,
        program_name="Peak",
        date_start="2026-02-01",
    )
    db_session.add_all([first, second])
    db_session.flush()

    first_session = SessionModel(
        program_id=first.id,
        week_number=1,
        day_number=1,
        day_name="Day 1",
    )
    second_session = SessionModel(
        program_id=second.id,
        week_number=1,
        day_number=1,
        day_name="Day 1",
    )
    db_session.add_all([first_session, second_session])
    db_session.flush()

    db_session.add_all(
        [
            ExerciseEntry(
                session_id=first_session.id,
                exercise_name="Competition Squat",
                exercise_order=1,
                exercise_group=1,
                set_type="top_set",
                lift_category="squat",
                sets=1,
                reps=3,
                weight_lbs=300.0,
            ),
            ExerciseEntry(
                session_id=second_session.id,
                exercise_name="Competition Squat",
                exercise_order=1,
                exercise_group=1,
                set_type="top_set",
                lift_category="squat",
                sets=1,
                reps=3,
                weight_lbs=320.0,
            ),
        ]
    )
    db_session.commit()

    events = get_athlete_pr_events(athlete.id, db=db_session)

    assert len(events) == 1
    assert events[0].variation_canon == "competition squat"
    assert events[0].is_competition is True
    assert events[0].program_number == 2
    assert events[0].recorded_at == "2026-02-01"


def test_pr_events_route_excludes_future_sessions_but_keeps_past_same_block(db_session):
    athlete = Athlete(name="Future Filter Athlete")
    db_session.add(athlete)
    db_session.flush()

    current_block_start = (datetime.utcnow() - timedelta(days=7)).date().isoformat()
    baseline = Program(
        athlete_id=athlete.id,
        program_number=1,
        program_name="Baseline",
        date_start=(datetime.utcnow() - timedelta(days=45)).date().isoformat(),
    )
    current = Program(
        athlete_id=athlete.id,
        program_number=2,
        program_name="Current",
        date_start=current_block_start,
    )
    db_session.add_all([baseline, current])
    db_session.flush()

    baseline_session = SessionModel(
        program_id=baseline.id,
        week_number=1,
        day_number=1,
        day_name="Day 1",
    )
    past_session = SessionModel(
        program_id=current.id,
        week_number=1,
        day_number=1,
        day_name="Day 1",
    )
    future_session = SessionModel(
        program_id=current.id,
        week_number=3,
        day_number=1,
        day_name="Day 1",
    )
    db_session.add_all([baseline_session, past_session, future_session])
    db_session.flush()

    db_session.add_all(
        [
            ExerciseEntry(
                session_id=baseline_session.id,
                exercise_name="Competition Squat",
                exercise_order=1,
                exercise_group=1,
                set_type="top_set",
                lift_category="squat",
                sets=1,
                reps=3,
                weight_lbs=300.0,
            ),
            ExerciseEntry(
                session_id=past_session.id,
                exercise_name="Competition Squat",
                exercise_order=1,
                exercise_group=1,
                set_type="top_set",
                lift_category="squat",
                sets=1,
                reps=3,
                weight_lbs=320.0,
            ),
            ExerciseEntry(
                session_id=future_session.id,
                exercise_name="Competition Squat",
                exercise_order=1,
                exercise_group=1,
                set_type="top_set",
                lift_category="squat",
                sets=1,
                reps=3,
                weight_lbs=500.0,
            ),
        ]
    )
    db_session.commit()

    events = get_athlete_pr_events(athlete.id, db=db_session)

    assert len(events) == 1
    assert events[0].program_id == current.id
    assert events[0].e1rm == 352.0
    assert events[0].prev_best_e1rm == 330.0


def test_pr_events_route_404(db_session):
    with pytest.raises(HTTPException) as exc:
        get_athlete_pr_events(99999, db=db_session)

    assert exc.value.status_code == 404
