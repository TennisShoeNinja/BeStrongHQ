"""Tests for the per-lift percent-of-median outlier detector."""

import re

from bestrong.analytics.outliers import (
    OutlierFlag,
    OutlierInput,
    flag_outliers,
)


def _mk(
    e1rm: float | None,
    lift: str = "squat",
    *,
    program: int | None = 1,
    week: int = 1,
    day: int = 1,
) -> OutlierInput:
    """Compact constructor so test cases stay readable."""
    return OutlierInput(
        e1rm=e1rm,
        lift_category=lift,
        program_number=program,
        week_number=week,
        day_number=day,
    )


_BASELINE = [495.0, 500.0, 505.0, 498.0, 502.0, 497.0, 503.0, 499.0, 501.0, 500.0]


def test_empty_input_returns_empty_list():
    """Empty list in → empty list out, no errors."""
    assert flag_outliers([]) == []


def test_single_point_never_flagged():
    """One point can't be an outlier — no history to score against."""
    result = flag_outliers([_mk(500.0)])
    assert result == [OutlierFlag(is_outlier=False, reason=None)]


def test_under_min_sample_never_flagged():
    """The first min_sample points of each lift always pass through."""


    points = [_mk(500.0), _mk(500.0), _mk(500.0), _mk(99999.0)]
    result = flag_outliers(points)
    assert all(not f.is_outlier for f in result)
    assert all(f.reason is None for f in result)


def test_uniform_series_never_flags():
    """Constant history → delta is always 0 → never flags, no div-by-zero."""
    points = [_mk(500.0) for _ in range(15)]
    result = flag_outliers(points)
    assert len(result) == 15
    assert all(not f.is_outlier for f in result)
    assert all(f.reason is None for f in result)


def test_none_e1rm_is_never_flagged():
    """None e1rms pass through untouched and don't pollute history."""
    points = [_mk(v) for v in _BASELINE] + [_mk(None)]
    result = flag_outliers(points)
    assert result[-1] == OutlierFlag(is_outlier=False, reason=None)


def test_none_e1rm_does_not_break_later_scoring():
    """A None point in the middle must be skipped cleanly — the next real
    point should still be scored against the prior non-None history."""


    points = [_mk(v) for v in _BASELINE] + [_mk(None), _mk(1000.0)]
    result = flag_outliers(points)
    assert not result[-2].is_outlier
    assert result[-2].reason is None
    assert result[-1].is_outlier
    assert result[-1].reason is not None


def test_clear_spike_above_is_flagged():
    """10 baseline points then an 800 (60% above median 500) should fire."""
    points = [_mk(v) for v in _BASELINE] + [_mk(800.0)]
    result = flag_outliers(points)
    assert len(result) == 11
    assert result[-1].is_outlier is True
    reason = result[-1].reason
    assert reason is not None
    assert "above" in reason
    assert "average" in reason
    assert "lbs" in reason

    assert re.search(r"\(\d+%\)", reason) is not None


def test_clear_dip_below_is_flagged():
    """10 baseline points then a 250 (50% below median 500) should fire."""
    points = [_mk(v) for v in _BASELINE] + [_mk(250.0)]
    result = flag_outliers(points)
    assert result[-1].is_outlier is True
    reason = result[-1].reason
    assert reason is not None
    assert "below" in reason


def test_baseline_points_not_flagged():
    """The baseline points themselves must never trip the detector — they
    hover within ~1% of the median, well under the 40% threshold."""
    points = [_mk(v) for v in _BASELINE]
    result = flag_outliers(points)
    assert not any(f.is_outlier for f in result)


def test_median_catches_third_outlier_despite_earlier_spikes():
    """A couple of earlier spikes must not inflate the window enough to
    mask a later one. Median is robust to a minority of wild values, so
    a third 1500 against a window still centered near 500 keeps firing."""
    points = (
        [_mk(v) for v in _BASELINE]
        + [_mk(1500.0)]
        + [_mk(500.0), _mk(502.0)]
        + [_mk(1500.0)]
        + [_mk(498.0), _mk(501.0)]
        + [_mk(1500.0)]
    )
    result = flag_outliers(points)
    assert result[10].is_outlier
    assert result[13].is_outlier
    assert result[16].is_outlier


def test_lifts_are_scored_independently():
    """A squat spike must not flag a bench, even when the raw number would
    be wild if the two histories were mixed."""
    squats = [_mk(v, "squat") for v in _BASELINE]
    benches = [
        _mk(v, "bench")
        for v in [198.0, 200.0, 202.0, 199.0, 201.0, 200.0, 198.0, 203.0, 201.0, 199.0]
    ]
    interleaved: list[OutlierInput] = []
    for s, b in zip(squats, benches):
        interleaved.extend([s, b])

    interleaved.append(_mk(800.0, "squat"))

    interleaved.append(_mk(202.0, "bench"))

    result = flag_outliers(interleaved)
    assert result[-2].is_outlier
    assert not result[-1].is_outlier


def test_per_lift_history_does_not_leak():
    """A lift with plenty of history must not lend that history to a
    sibling lift that's still below min_sample."""


    points = [_mk(v, "squat") for v in _BASELINE]
    points.append(_mk(99999.0, "bench"))
    result = flag_outliers(points)
    assert not result[-1].is_outlier


def test_reference_indices_point_at_the_trailing_window():
    """A flagged point must expose the input positions whose e1rms built
    the trailing window, so the UI can show the coach exactly which rows
    the 'average' was computed from."""


    points = [_mk(v) for v in _BASELINE] + [_mk(800.0)]
    result = flag_outliers(points)
    assert result[-1].is_outlier
    assert result[-1].reference_indices == tuple(range(10))
    assert result[-1].trailing_median == 500.0


def test_reference_indices_skip_other_lifts():
    """The window for a flagged squat must only reference prior squat
    indices, not interleaved bench points."""

    squats = [_mk(v, "squat") for v in _BASELINE]
    benches = [_mk(v, "bench") for v in _BASELINE]
    interleaved: list[OutlierInput] = []
    for s, b in zip(squats, benches):
        interleaved.extend([s, b])
    interleaved.append(_mk(800.0, "squat"))

    result = flag_outliers(interleaved)
    spike_flag = result[-1]
    assert spike_flag.is_outlier


    assert all(i % 2 == 0 for i in spike_flag.reference_indices)
    assert len(spike_flag.reference_indices) == 10


def test_reference_indices_empty_below_min_sample():
    """Early points that lack enough history have no scoring window, so
    reference_indices must be empty and trailing_median must be None."""
    points = [_mk(500.0), _mk(505.0)]
    result = flag_outliers(points)
    for f in result:
        assert f.reference_indices == ()
        assert f.trailing_median is None


def test_custom_pct_threshold_is_respected():
    """A loose threshold stops flagging an otherwise-flagged spike; a tight
    one fires on a point that would pass the default."""

    points = [_mk(v) for v in _BASELINE] + [_mk(520.0)]
    loose = flag_outliers(points, pct_threshold=0.50)
    assert not loose[-1].is_outlier
    tight = flag_outliers(points, pct_threshold=0.01)
    assert tight[-1].is_outlier


def test_custom_min_sample_is_respected():
    """Raising min_sample keeps more early points unflagged. Lowering it
    lets the detector fire sooner."""


    short = [_mk(500.0), _mk(502.0), _mk(498.0), _mk(900.0)]
    result_default = flag_outliers(short)
    assert not result_default[-1].is_outlier
    result_low = flag_outliers(short, min_sample=3)
    assert result_low[-1].is_outlier


def test_output_length_and_order_match_input():
    """Same length, same order — callers rely on this to zip back onto
    their own point list."""
    points = [_mk(v, lift) for v, lift in [
        (500.0, "squat"), (200.0, "bench"), (None, "squat"),
        (505.0, "squat"), (201.0, "bench"),
    ]]
    result = flag_outliers(points)
    assert len(result) == len(points)


def test_deterministic_repeated_runs():
    """Same input → same output, no random seeds."""
    points = [_mk(v) for v in _BASELINE] + [_mk(800.0), _mk(None), _mk(900.0)]
    first = flag_outliers(points)
    second = flag_outliers(points)
    assert first == second


def test_reason_format_contains_delta_and_percent():
    """Reason string shape: '<int> lbs above/below average (<int>%)'."""
    points = [_mk(v) for v in _BASELINE] + [_mk(800.0)]
    result = flag_outliers(points)
    reason = result[-1].reason
    assert reason is not None

    assert "300 lbs above average" in reason

    match = re.search(r"\((\d+)%\)", reason)
    assert match is not None, f"expected (<int>%) in {reason!r}"
    assert int(match.group(1)) == 60


def test_reason_omits_z_score_and_trailing_mean_language():
    """The old phrasing ('trailing mean', z=...) is gone. Coaches see a
    plain 'X lbs above/below average (Y%)' string now."""
    points = [_mk(v) for v in _BASELINE] + [_mk(800.0)]
    reason = flag_outliers(points)[-1].reason
    assert reason is not None
    assert "z=" not in reason
    assert "trailing mean" not in reason
