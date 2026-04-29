"""Outlier detection for per-lift e1rm progression charts.

Flags e1rm points that sit far enough outside the lift's recent history
to be worth reviewing for data-entry errors (decimal shifts, transposed
digits, warm-ups logged as top sets). The threshold is intentionally
loose: normal block-to-block variation and heavy-single weeks must pass
through unflagged — we're catching typos, not training variance.

Uses a percent-of-median threshold against the trailing window's median
(robust to one bad point masking itself, unlike mean + stdev). Each flag
also carries the input indices of the window it was scored against so
the UI can show the coach exactly which rows built the "average."

Kept free of SQLAlchemy and any I/O so the logic is unit-testable in
isolation. The route handler loads e1rm points and hands them in as a list.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import median


TRAILING_WINDOW = 10


DEFAULT_PCT_THRESHOLD = 0.40


@dataclass(frozen=True)
class OutlierInput:
    """A single e1rm point to evaluate.

    Attributes:
        e1rm: The estimated 1RM in pounds, or None if it couldn't be computed
            (missing RPE, zero weight, etc.). None points are never flagged.
        lift_category: Lift grouping key — "squat", "bench", "deadlift", etc.
            Points are only compared against other points in the same category.
        program_number: Program/block number the point came from, or None.
        week_number: Week number within the program.
        day_number: Day number within the week.
    """

    e1rm: float | None
    lift_category: str
    program_number: int | None
    week_number: int
    day_number: int


@dataclass(frozen=True)
class OutlierFlag:
    """The result of evaluating a single point.

    Attributes:
        is_outlier: True when the point exceeded `pct_threshold` above or
            below the trailing median and the window had at least
            `min_sample` usable points.
        reason: Human-readable explanation including the numeric delta
            and percent, e.g. "76 lbs above average (19%)". None when the
            point wasn't flagged.
        trailing_median: The median of the trailing window used to score
            this point, or None when no window was available (first
            `min_sample` points of a lift, or None e1rm).
        reference_indices: Positions in the input list whose e1rms formed
            the trailing window for this point. Empty tuple when no
            window was available. The caller can look these up to show
            the coach which rows built the "average."
    """

    is_outlier: bool
    reason: str | None
    trailing_median: float | None = None
    reference_indices: tuple[int, ...] = field(default_factory=tuple)


def _format_reason(delta: float, pct: float) -> str:
    """Build the human-readable reason string.

    Rounds delta to a whole pound and percent to a whole number — coaches
    don't need decimals on a typo-sized spike.
    """
    direction = "above" if delta >= 0 else "below"
    magnitude = int(round(abs(delta)))
    pct_whole = int(round(abs(pct) * 100))
    return f"{magnitude} lbs {direction} average ({pct_whole}%)"


def flag_outliers(
    points: list[OutlierInput],
    *,
    pct_threshold: float = DEFAULT_PCT_THRESHOLD,
    min_sample: int = 5,
) -> list[OutlierFlag]:
    """Flag suspicious e1rm points using a per-lift percent-of-median test.

    For each point, builds a trailing window of up to `TRAILING_WINDOW`
    prior e1rm values from the same lift_category (excluding the current
    point and any None e1rms). If the window has at least `min_sample`
    values and `|value - median| / median > pct_threshold`, the point is
    flagged.

    The algorithm is deterministic and order-preserving: the returned list
    is the same length and order as the input, so callers can zip it back
    onto their point list without bookkeeping.

    Args:
        points: e1rm points to evaluate, in chronological order within each
            lift. Order across lifts doesn't matter — each lift is grouped
            and processed independently.
        pct_threshold: Fraction of the trailing median above or below which
            a point is flagged. Defaults to 0.40 (±40%). Intentionally
            loose — we're catching data-entry typos, not training spikes.
        min_sample: Minimum trailing-window size required to flag. Below
            this, the point passes through unflagged regardless of how far
            from the median it sits — too little history to trust the call.

    Returns:
        A list of OutlierFlag in the same order as the input. None-e1rm
        points and insufficient-history points return OutlierFlag with
        is_outlier=False, reason=None, and empty reference_indices.
    """


    trailing: dict[str, list[tuple[int, float]]] = {}
    results: list[OutlierFlag] = []

    for i, point in enumerate(points):
        if point.e1rm is None:
            results.append(OutlierFlag(is_outlier=False, reason=None))
            continue

        history = trailing.setdefault(point.lift_category, [])
        window = history[-TRAILING_WINDOW:]

        if len(window) < min_sample:
            results.append(OutlierFlag(is_outlier=False, reason=None))
            history.append((i, point.e1rm))
            continue

        window_values = [v for _, v in window]
        med = median(window_values)
        indices = tuple(idx for idx, _ in window)


        if med <= 0:
            results.append(
                OutlierFlag(
                    is_outlier=False,
                    reason=None,
                    trailing_median=med,
                    reference_indices=indices,
                )
            )
            history.append((i, point.e1rm))
            continue

        delta = point.e1rm - med
        pct = delta / med

        if abs(pct) > pct_threshold:
            reason = _format_reason(delta, pct)
            results.append(
                OutlierFlag(
                    is_outlier=True,
                    reason=reason,
                    trailing_median=med,
                    reference_indices=indices,
                )
            )
        else:
            results.append(
                OutlierFlag(
                    is_outlier=False,
                    reason=None,
                    trailing_median=med,
                    reference_indices=indices,
                )
            )


        history.append((i, point.e1rm))

    return results
