"""Block-level PR event derivation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from ..utils.dates import parse_program_start
from ..utils.exercise_names import canonicalize_with_aliases
from .e1rm import peak_e1rm


_COMPETITION_LIFTS = frozenset(("squat", "bench", "deadlift"))
_MAX_REPS_FOR_E1RM_PR = 8


@dataclass(frozen=True)
class PRSetInput:
    exercise_name: str
    lift_category: str | None
    weight_lbs: float | None
    reps: int | None
    actual_rpe: float | None
    failed: bool
    program_id: int
    program_name: str | None
    program_number: int | None
    date_start: str | None
    imported_at: datetime | None


@dataclass(frozen=True)
class PREvent:
    variation: str
    variation_canon: str
    is_competition: bool
    program_id: int
    program_name: str | None
    e1rm: float
    prev_best_e1rm: float
    delta: float
    recorded_at: str | None


@dataclass(frozen=True)
class _BlockPeak:
    variation: str
    variation_canon: str
    lift_category: str | None
    program_id: int
    program_name: str | None
    program_number: int | None
    date_start: str | None
    imported_at: datetime | None
    e1rm: float


def is_competition_name(canonical: str, lift_category: str | None) -> bool:
    """Port of the frontend competition-lift name heuristic.

    The server also gates on the three lift categories because it receives
    the raw lift_category string, not an already narrowed LiftKey.
    """
    lift = (lift_category or "").lower().strip()
    if lift not in _COMPETITION_LIFTS:
        return False

    c = canonical.lower().strip()
    if not c:
        return False
    if "comp" in c:
        return True
    if lift == "squat":
        return c == "squat" or c == "back squat"
    if lift == "bench":
        return c == "bench" or c == "bench press"
    if lift == "deadlift":
        return c == "deadlift" or c == "conventional deadlift"
    return False


def derive_pr_events(
    sets: list[PRSetInput],
    alias_map: dict[str, str] | None = None,
) -> list[PREvent]:
    """Return block-peak PR events, excluding each variation's debut block."""
    peaks: dict[tuple[str, int], _BlockPeak] = {}

    for row in sets:
        if row.failed:
            continue
        if row.weight_lbs is None or row.weight_lbs <= 0:
            continue
        if row.reps is None or row.reps <= 0 or row.reps > _MAX_REPS_FOR_E1RM_PR:
            continue

        e1rm, _method = peak_e1rm(row.weight_lbs, row.reps, row.actual_rpe)
        if e1rm is None:
            continue

        canon = canonicalize_with_aliases(row.exercise_name, alias_map)
        if not canon:
            continue

        key = (canon, row.program_id)
        current = peaks.get(key)
        if current is not None and current.e1rm >= e1rm:
            continue
        peaks[key] = _BlockPeak(
            variation=row.exercise_name,
            variation_canon=canon,
            lift_category=row.lift_category,
            program_id=row.program_id,
            program_name=row.program_name,
            program_number=row.program_number,
            date_start=row.date_start,
            imported_at=row.imported_at,
            e1rm=e1rm,
        )

    by_variation: dict[str, list[_BlockPeak]] = {}
    for peak in peaks.values():
        by_variation.setdefault(peak.variation_canon, []).append(peak)

    events: list[PREvent] = []
    for variation_peaks in by_variation.values():
        running_best: float | None = None
        for peak in sorted(variation_peaks, key=_block_sort_key):
            if running_best is None:
                running_best = peak.e1rm
                continue
            if peak.e1rm > running_best:
                events.append(
                    PREvent(
                        variation=peak.variation,
                        variation_canon=peak.variation_canon,
                        is_competition=is_competition_name(
                            peak.variation_canon,
                            peak.lift_category,
                        ),
                        program_id=peak.program_id,
                        program_name=peak.program_name,
                        e1rm=round(peak.e1rm, 1),
                        prev_best_e1rm=round(running_best, 1),
                        delta=round(peak.e1rm - running_best, 1),
                        recorded_at=_recorded_at(peak),
                    )
                )
                running_best = peak.e1rm

    return sorted(events, key=_event_sort_key)


def _block_sort_key(peak: _BlockPeak) -> tuple[Any, ...]:
    # Blocks sort by start date, then program number, then import timestamp.
    # That mirrors the coach-facing chronology while staying stable when a
    # historical import has an incomplete date.
    return (
        _date_sort_value(peak.date_start),
        peak.program_number if peak.program_number is not None else 10**9,
        peak.imported_at or datetime.max,
        peak.program_id,
    )


def _event_sort_key(event: PREvent) -> tuple[Any, ...]:
    return (
        _date_sort_value(event.recorded_at),
        event.program_id,
        event.variation_canon,
    )


def _date_sort_value(value: str | None) -> tuple[int, str]:
    if not value:
        return (1, "")
    parsed = parse_program_start(value)
    if parsed is not None:
        return (0, parsed.isoformat())
    return (0, value)


def _recorded_at(peak: _BlockPeak) -> str | None:
    if peak.date_start:
        return peak.date_start
    if peak.imported_at is not None:
        return peak.imported_at.isoformat()
    return None
