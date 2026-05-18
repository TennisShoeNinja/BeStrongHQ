"""Infer the prescribed training session for the current day."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from ..utils.dates import parse_program_start

SESSION_COMPLETION_THRESHOLD = 0.6

SessionStatus = Literal["not_started", "in_progress", "completed", "unknown"]
WeekConfidence = Literal["logged", "estimated", "unknown"]
MatchMode = Literal["weekday", "next_up"]


@dataclass(frozen=True)
class InferredExercise:
    exercise_name: str
    lift_category: str
    sets: int
    reps: int | None
    weight_lbs: float | None
    target_rpe: str | None
    is_accessory: bool


@dataclass(frozen=True)
class InferredSession:
    id: int
    week_number: int
    day_number: int
    day_name: str
    session_label: str | None
    status: SessionStatus
    exercises: list[InferredExercise]


@dataclass(frozen=True)
class TodaySessionInference:
    program_id: int
    program_name: str | None
    week_number: int
    total_weeks: int
    week_confidence: WeekConfidence
    match_mode: MatchMode
    session: InferredSession | None


def _session_sort_key(session) -> tuple[int, int, int]:
    return (
        int(getattr(session, "week_number", 0) or 0),
        int(getattr(session, "day_number", 0) or 0),
        int(getattr(session, "id", 0) or 0),
    )


def _exercise_sort_key(exercise) -> tuple[bool, int, int, int]:
    return (
        bool(getattr(exercise, "is_accessory", False)),
        int(getattr(exercise, "exercise_order", 0) or 0),
        int(getattr(exercise, "exercise_group", 0) or 0),
        int(getattr(exercise, "id", 0) or 0),
    )


def get_session_status(exercises) -> SessionStatus:
    loggable = 0
    logged = 0

    for exercise in exercises:
        weight_expected = bool(getattr(exercise, "weight_expected", False))
        rpe_expected = bool(getattr(exercise, "rpe_expected", False))
        if not weight_expected and not rpe_expected:
            continue

        loggable += 1
        has_logged_weight = (
            weight_expected and getattr(exercise, "weight_lbs", None) is not None
        )
        has_logged_rpe = rpe_expected and getattr(exercise, "actual_rpe", None) is not None
        if has_logged_weight or has_logged_rpe:
            logged += 1

    if loggable == 0:
        return "unknown"
    if logged == 0:
        return "not_started"
    if logged / loggable >= SESSION_COMPLETION_THRESHOLD:
        return "completed"
    return "in_progress"


def _infer_current_week(program, sessions, statuses: dict[int, SessionStatus], today: date):
    max_week = max(int(getattr(session, "week_number", 0) or 0) for session in sessions)
    latest_active_week: int | None = None
    for session in sessions:
        status = statuses.get(int(getattr(session, "id", 0) or 0), "unknown")
        if status in {"in_progress", "completed"}:
            week_number = int(getattr(session, "week_number", 0) or 0)
            latest_active_week = max(latest_active_week or week_number, week_number)

    if latest_active_week is not None:
        known_statuses = [
            statuses.get(int(getattr(session, "id", 0) or 0), "unknown")
            for session in sessions
            if int(getattr(session, "week_number", 0) or 0) == latest_active_week
            and statuses.get(int(getattr(session, "id", 0) or 0), "unknown") != "unknown"
        ]
        if known_statuses and all(status == "completed" for status in known_statuses):
            return min(latest_active_week + 1, max_week), "logged"
        return latest_active_week, "logged"

    start = parse_program_start(getattr(program, "date_start", None))
    if start is not None:
        week_number = (today - start.date()).days // 7 + 1
        return min(max(week_number, 1), max_week), "estimated"

    return 1, "unknown"


def _to_inferred_session(session, status: SessionStatus, exercises) -> InferredSession:
    return InferredSession(
        id=int(getattr(session, "id")),
        week_number=int(getattr(session, "week_number")),
        day_number=int(getattr(session, "day_number")),
        day_name=str(getattr(session, "day_name", "") or ""),
        session_label=getattr(session, "session_label", None),
        status=status,
        exercises=[
            InferredExercise(
                exercise_name=str(getattr(exercise, "exercise_name", "")),
                lift_category=str(getattr(exercise, "lift_category", "")),
                sets=int(getattr(exercise, "sets", 0) or 0),
                reps=getattr(exercise, "reps", None),
                weight_lbs=getattr(exercise, "weight_lbs", None),
                target_rpe=getattr(exercise, "target_rpe", None),
                is_accessory=bool(getattr(exercise, "is_accessory", False)),
            )
            for exercise in sorted(exercises, key=_exercise_sort_key)
        ],
    )


def infer_today_session(program, sessions, exercises_by_session, today: date):
    sorted_sessions = sorted(sessions, key=_session_sort_key)
    if not sorted_sessions:
        return None

    statuses = {
        int(getattr(session, "id")): get_session_status(
            exercises_by_session.get(int(getattr(session, "id")), [])
        )
        for session in sorted_sessions
    }
    current_week, confidence = _infer_current_week(
        program, sorted_sessions, statuses, today
    )
    total_weeks = max(
        int(getattr(session, "week_number", 0) or 0) for session in sorted_sessions
    )
    sessions_in_week = [
        session
        for session in sorted_sessions
        if int(getattr(session, "week_number", 0) or 0) == current_week
    ]
    if not sessions_in_week:
        return TodaySessionInference(
            program_id=int(getattr(program, "id")),
            program_name=getattr(program, "program_name", None),
            week_number=current_week,
            total_weeks=total_weeks,
            week_confidence=confidence,
            match_mode="weekday",
            session=None,
        )

    today_name = today.strftime("%A").casefold()
    for session in sessions_in_week:
        if str(getattr(session, "day_name", "") or "").strip().casefold() == today_name:
            session_id = int(getattr(session, "id"))
            return TodaySessionInference(
                program_id=int(getattr(program, "id")),
                program_name=getattr(program, "program_name", None),
                week_number=current_week,
                total_weeks=total_weeks,
                week_confidence=confidence,
                match_mode="weekday",
                session=_to_inferred_session(
                    session,
                    statuses.get(session_id, "unknown"),
                    exercises_by_session.get(session_id, []),
                ),
            )

    has_weekday_labels = any(
        str(getattr(session, "day_name", "") or "").strip()
        for session in sessions_in_week
    )
    if has_weekday_labels:
        return TodaySessionInference(
            program_id=int(getattr(program, "id")),
            program_name=getattr(program, "program_name", None),
            week_number=current_week,
            total_weeks=total_weeks,
            week_confidence=confidence,
            match_mode="weekday",
            session=None,
        )

    next_session = next(
        (
            session
            for session in sessions_in_week
            if statuses.get(int(getattr(session, "id")), "unknown") != "completed"
        ),
        None,
    )
    if next_session is None:
        inferred_session = None
    else:
        session_id = int(getattr(next_session, "id"))
        inferred_session = _to_inferred_session(
            next_session,
            statuses.get(session_id, "unknown"),
            exercises_by_session.get(session_id, []),
        )

    return TodaySessionInference(
        program_id=int(getattr(program, "id")),
        program_name=getattr(program, "program_name", None),
        week_number=current_week,
        total_weeks=total_weeks,
        week_confidence=confidence,
        match_mode="next_up",
        session=inferred_session,
    )
