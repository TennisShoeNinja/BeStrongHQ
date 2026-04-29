"""Estimated 1RM calculation using the Tuchscherer/RTS RPE percentage table.

The RPE chart maps (reps, RPE) pairs to a percentage of 1RM. For example,
if an athlete squats 300 lbs for 3 reps at RPE 8, the table says 3@8 = 84.3%,
so E1RM = 300 / 0.843 = 356 lbs.

Reference: Mike Tuchscherer, "The Reactive Training Manual"
"""

from __future__ import annotations


_RPE_TABLE: dict[tuple[int, float], float] = {

    (1, 10.0): 100.0, (1, 9.5): 97.8, (1, 9.0): 95.5, (1, 8.5): 93.9,
    (1, 8.0): 92.2, (1, 7.5): 90.7, (1, 7.0): 89.2, (1, 6.5): 87.6, (1, 6.0): 86.3,

    (2, 10.0): 95.5, (2, 9.5): 93.9, (2, 9.0): 92.2, (2, 8.5): 90.7,
    (2, 8.0): 89.2, (2, 7.5): 87.6, (2, 7.0): 86.3, (2, 6.5): 85.0, (2, 6.0): 83.7,

    (3, 10.0): 92.2, (3, 9.5): 90.7, (3, 9.0): 89.2, (3, 8.5): 87.6,
    (3, 8.0): 86.3, (3, 7.5): 85.0, (3, 7.0): 83.7, (3, 6.5): 82.4, (3, 6.0): 81.1,

    (4, 10.0): 89.2, (4, 9.5): 87.6, (4, 9.0): 86.3, (4, 8.5): 85.0,
    (4, 8.0): 83.7, (4, 7.5): 82.4, (4, 7.0): 81.1, (4, 6.5): 79.9, (4, 6.0): 78.6,

    (5, 10.0): 86.3, (5, 9.5): 85.0, (5, 9.0): 83.7, (5, 8.5): 82.4,
    (5, 8.0): 81.1, (5, 7.5): 79.9, (5, 7.0): 78.6, (5, 6.5): 77.4, (5, 6.0): 76.2,

    (6, 10.0): 83.7, (6, 9.5): 82.4, (6, 9.0): 81.1, (6, 8.5): 79.9,
    (6, 8.0): 78.6, (6, 7.5): 77.4, (6, 7.0): 76.2, (6, 6.5): 75.1, (6, 6.0): 73.9,

    (7, 10.0): 81.1, (7, 9.5): 79.9, (7, 9.0): 78.6, (7, 8.5): 77.4,
    (7, 8.0): 76.2, (7, 7.5): 75.1, (7, 7.0): 73.9, (7, 6.5): 72.3, (7, 6.0): 70.7,

    (8, 10.0): 78.6, (8, 9.5): 77.4, (8, 9.0): 76.2, (8, 8.5): 75.1,
    (8, 8.0): 73.9, (8, 7.5): 72.3, (8, 7.0): 70.7, (8, 6.5): 69.4, (8, 6.0): 68.0,

    (9, 10.0): 76.2, (9, 9.5): 75.1, (9, 9.0): 73.9, (9, 8.5): 72.3,
    (9, 8.0): 70.7, (9, 7.5): 69.4, (9, 7.0): 68.0, (9, 6.5): 66.7, (9, 6.0): 65.3,

    (10, 10.0): 73.9, (10, 9.5): 72.3, (10, 9.0): 70.7, (10, 8.5): 69.4,
    (10, 8.0): 68.0, (10, 7.5): 66.7, (10, 7.0): 65.3, (10, 6.5): 64.0, (10, 6.0): 62.6,

    (11, 10.0): 70.7, (11, 9.5): 69.4, (11, 9.0): 68.0, (11, 8.5): 66.7,
    (11, 8.0): 65.3, (11, 7.5): 64.0, (11, 7.0): 62.6, (11, 6.5): 61.3, (11, 6.0): 59.9,

    (12, 10.0): 68.0, (12, 9.5): 66.7, (12, 9.0): 65.3, (12, 8.5): 64.0,
    (12, 8.0): 62.6, (12, 7.5): 61.3, (12, 7.0): 59.9, (12, 6.5): 58.6, (12, 6.0): 57.4,
}


def _snap_rpe(rpe: float) -> float:
    """Snap an RPE value to the nearest 0.5 increment in range [6, 10]."""
    clamped = max(6.0, min(10.0, rpe))
    return round(clamped * 2) / 2


def calculate_e1rm(weight_lbs: float, reps: int, rpe: float) -> float | None:
    """Calculate estimated 1RM using the RPE percentage table.

    Args:
        weight_lbs: Weight lifted in pounds.
        reps: Number of reps performed.
        rpe: Rate of perceived exertion (6-10 scale).

    Returns:
        Estimated 1RM in pounds, rounded to 1 decimal, or None if inputs are invalid.
    """
    if weight_lbs is None or weight_lbs <= 0:
        return None
    if reps is None or reps < 1:
        return None
    if rpe is None or rpe < 6.0:
        return None


    clamped_reps = min(reps, 12)
    snapped_rpe = _snap_rpe(rpe)

    pct = _RPE_TABLE.get((clamped_reps, snapped_rpe))
    if pct is None or pct == 0:
        return None

    return round(weight_lbs / (pct / 100.0), 1)


def calculate_e1rm_epley(weight_lbs: float, reps: int) -> float | None:
    """Calculate estimated 1RM with the Epley formula as a no-RPE fallback.

    Used when actual_rpe is missing. Formula: weight * (1 + reps / 30). A true
    single (reps=1) returns the raw weight.

    Args:
        weight_lbs: Weight lifted in pounds.
        reps: Number of reps performed.

    Returns:
        Estimated 1RM in pounds rounded to 1 decimal, or None if inputs are invalid.
    """
    if weight_lbs is None or weight_lbs <= 0:
        return None
    if reps is None or reps < 1:
        return None

    return round(weight_lbs * (1.0 + reps / 30.0), 1)


def peak_e1rm(
    weight_lbs: float, reps: int, rpe: float | None
) -> tuple[float | None, str]:
    """Best-effort estimated 1RM used for peak detection.

    When an actual RPE is available, use the Tuchscherer table (it accounts for
    how hard the set felt). Otherwise fall back to Epley from weight and reps.
    Returns a (value, method) tuple where method is "rpe", "epley", "actual"
    (for a true single with RPE 10), or "none" if no e1rm could be computed.
    """
    if weight_lbs is None or weight_lbs <= 0 or reps is None or reps < 1:
        return None, "none"

    if rpe is not None and rpe >= 6.0:
        value = calculate_e1rm(weight_lbs, reps, rpe)
        if value is not None:

            if reps == 1 and _snap_rpe(rpe) == 10.0:
                return value, "actual"
            return value, "rpe"

    value = calculate_e1rm_epley(weight_lbs, reps)
    if value is None:
        return None, "none"
    return value, "epley"


def calculate_e1rm_for_entries(entries: list[dict]) -> list[dict]:
    """Calculate E1RM for a list of exercise entry dicts.

    Each entry should have: weight_lbs, reps, actual_rpe, plus any metadata
    (week_number, day_number, exercise_name, lift_category, etc.)

    Returns a new list with an added 'e1rm' field on each entry.
    """
    results = []
    for entry in entries:
        e1rm = calculate_e1rm(
            weight_lbs=entry.get("weight_lbs"),
            reps=entry.get("reps"),
            rpe=entry.get("actual_rpe"),
        )
        results.append({**entry, "e1rm": e1rm})
    return results
