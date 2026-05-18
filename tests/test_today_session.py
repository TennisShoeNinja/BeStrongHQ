"""Unit tests for today's prescribed session inference."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from bestrong.services.today_session import get_session_status, infer_today_session


def program(date_start: str | None = "2026-05-04"):
    return SimpleNamespace(id=10, program_name="Test Block", date_start=date_start)


def session(
    id_: int,
    week: int,
    day: int,
    day_name: str = "Monday",
    label: str | None = None,
):
    return SimpleNamespace(
        id=id_,
        week_number=week,
        day_number=day,
        day_name=day_name,
        session_label=label,
    )


def exercise(
    id_: int,
    session_id: int,
    weight_expected: bool = True,
    rpe_expected: bool = True,
    weight_lbs: float | None = None,
    actual_rpe: float | None = None,
    name: str = "Squat",
    accessory: bool = False,
):
    return SimpleNamespace(
        id=id_,
        session_id=session_id,
        exercise_name=name,
        lift_category="accessory" if accessory else "squat",
        exercise_order=id_,
        exercise_group=1,
        sets=3,
        reps=3,
        weight_lbs=weight_lbs,
        target_rpe="7",
        is_accessory=accessory,
        weight_expected=weight_expected,
        rpe_expected=rpe_expected,
        actual_rpe=actual_rpe,
    )


def exercises_for(sessions, logged_sessions: set[int], partial_sessions: set[int] | None = None):
    partial_sessions = partial_sessions or set()
    grouped = {}
    next_id = 1
    for item in sessions:
        rows = []
        for index in range(5):
            is_logged = item.id in logged_sessions or (
                item.id in partial_sessions and index == 0
            )
            rows.append(
                exercise(
                    next_id,
                    item.id,
                    weight_lbs=315 if is_logged else None,
                    actual_rpe=7 if is_logged else None,
                )
            )
            next_id += 1
        grouped[item.id] = rows
    return grouped


def test_completed_weeks_advance_to_next_blank_week():
    sessions = [
        session(1, 1, 1, "Monday"),
        session(2, 2, 1, "Monday"),
        session(3, 3, 1, "Monday"),
    ]

    result = infer_today_session(
        program(),
        sessions,
        exercises_for(sessions, logged_sessions={1, 2}),
        date(2026, 5, 18),
    )

    assert result is not None
    assert result.week_number == 3
    assert result.week_confidence == "logged"
    assert result.session is not None
    assert result.session.id == 3
    assert result.session.status == "not_started"


def test_partial_current_week_stays_current():
    sessions = [
        session(1, 1, 1, "Monday"),
        session(2, 2, 1, "Monday"),
        session(3, 2, 2, "Tuesday"),
    ]

    result = infer_today_session(
        program(),
        sessions,
        exercises_for(sessions, logged_sessions={1}, partial_sessions={2}),
        date(2026, 5, 12),
    )

    assert result is not None
    assert result.week_number == 2
    assert result.week_confidence == "logged"
    assert result.match_mode == "weekday"
    assert result.session is not None
    assert result.session.id == 3


def test_skipped_mid_program_week_trusts_latest_activity():
    sessions = [
        session(1, 1, 1, "Monday"),
        session(2, 2, 1, "Monday"),
        session(3, 3, 5, "Friday"),
    ]

    result = infer_today_session(
        program(),
        sessions,
        exercises_for(sessions, logged_sessions={1}, partial_sessions={3}),
        date(2026, 5, 22),
    )

    assert result is not None
    assert result.week_number == 3
    assert result.session is not None
    assert result.session.id == 3
    assert result.session.status == "in_progress"


def test_weight_only_logging_counts_for_completion():
    rows = [
        exercise(
            1,
            1,
            weight_expected=True,
            rpe_expected=False,
            weight_lbs=405,
            actual_rpe=None,
        )
        for _ in range(3)
    ]

    assert get_session_status(rows) == "completed"


def test_ordinal_template_uses_next_up_session():
    sessions = [
        session(1, 1, 1, ""),
        session(2, 1, 2, ""),
        session(3, 1, 3, ""),
    ]

    result = infer_today_session(
        program(),
        sessions,
        exercises_for(sessions, logged_sessions={1}),
        date(2026, 5, 12),
    )

    assert result is not None
    assert result.match_mode == "next_up"
    assert result.session is not None
    assert result.session.id == 2


def test_weekday_template_without_today_match_returns_no_session():
    sessions = [
        session(1, 1, 1, "Monday"),
        session(2, 1, 3, "Wednesday"),
    ]

    result = infer_today_session(
        program(),
        sessions,
        exercises_for(sessions, logged_sessions=set()),
        date(2026, 5, 12),
    )

    assert result is not None
    assert result.match_mode == "weekday"
    assert result.session is None


def test_nothing_logged_estimates_week_from_start_date():
    sessions = [
        session(1, 1, 1, "Monday"),
        session(2, 2, 1, "Monday"),
        session(3, 3, 1, "Monday"),
        session(4, 4, 1, "Monday"),
    ]

    result = infer_today_session(
        program(date_start="2026-05-04"),
        sessions,
        exercises_for(sessions, logged_sessions=set()),
        date(2026, 5, 18),
    )

    assert result is not None
    assert result.week_number == 3
    assert result.week_confidence == "estimated"
    assert result.session is not None
    assert result.session.id == 3


def test_nothing_logged_without_start_date_falls_back_to_week_one():
    sessions = [
        session(1, 1, 1, "Monday"),
        session(2, 2, 1, "Monday"),
    ]

    result = infer_today_session(
        program(date_start=None),
        sessions,
        exercises_for(sessions, logged_sessions=set()),
        date(2026, 5, 18),
    )

    assert result is not None
    assert result.week_number == 1
    assert result.week_confidence == "unknown"
    assert result.session is not None
    assert result.session.id == 1
