"""Tests for the volume-response classifier, aggregator, and confidence score."""

from bestrong.analytics.e1rm import (
    calculate_e1rm_epley,
    peak_e1rm,
)
from bestrong.analytics.volume_response import (
    aggregate_profile,
    build_explanation,
    classify_trailing_volume,
    classify_trailing_volume_with_reason,
    compute_confidence,
    profile_human_label,
    split_trailing_volume,
)


def test_epley_single_returns_weight():
    """A true single should return exactly the weight (1 + 1/30 ≈ 1.033)."""
    result = calculate_e1rm_epley(300.0, 1)
    assert result is not None
    assert abs(result - 310.0) < 0.1


def test_epley_triple():
    """300 x 3 Epley = 300 * 1.1 = 330."""
    assert calculate_e1rm_epley(300.0, 3) == 330.0


def test_epley_none_weight():
    assert calculate_e1rm_epley(None, 3) is None


def test_epley_zero_weight():
    assert calculate_e1rm_epley(0.0, 3) is None


def test_epley_none_reps():
    assert calculate_e1rm_epley(300.0, None) is None


def test_peak_e1rm_uses_rpe_when_present():
    """300 x 3 @ RPE 8 uses the RPE table, not Epley."""
    value, method = peak_e1rm(300.0, 3, 8.0)
    assert value is not None
    assert method == "rpe"

    assert abs(value - 347.6) < 1.0


def test_peak_e1rm_falls_back_to_epley_without_rpe():
    """Missing RPE should cleanly fall back to Epley."""
    value, method = peak_e1rm(300.0, 3, None)
    assert value == 330.0
    assert method == "epley"


def test_peak_e1rm_tested_single_at_rpe10_is_actual():
    """A true single at RPE 10 is labeled as an actual max, not an estimate."""
    value, method = peak_e1rm(500.0, 1, 10.0)
    assert value == 500.0
    assert method == "actual"


def test_peak_e1rm_invalid_inputs():
    assert peak_e1rm(None, 3, 8.0) == (None, "none")
    assert peak_e1rm(300.0, None, 8.0) == (None, "none")
    assert peak_e1rm(0.0, 3, 8.0) == (None, "none")


def test_classify_rising_volume():
    """Volume climbing from 10k to 20k should classify as rising."""
    assert classify_trailing_volume([10000, 12000, 14000, 18000, 20000]) == "rising"


def test_classify_tapered_volume():
    """Volume dropping from 20k to 10k should classify as tapered."""
    assert classify_trailing_volume([20000, 18000, 14000, 12000, 10000]) == "tapered"


def test_classify_steady_volume():
    """Volume oscillating around 15k should classify as steady."""
    assert classify_trailing_volume([15000, 15500, 14800, 15200, 15100]) == "steady"


def test_classify_insufficient_data():
    """Fewer than 3 non-null points is insufficient. The floor was loosened
    from 4 to 3 so athletes with occasional off-weeks in their trailing
    window still get a classification rather than a mute 'insufficient'."""
    assert classify_trailing_volume([10000, 12000]) == "insufficient"
    assert classify_trailing_volume([]) == "insufficient"
    assert classify_trailing_volume([None, None, 10000]) == "insufficient"


def test_classify_three_weeks_is_enough():
    """Three non-null clean weeks is the new floor — below we'd be reading noise."""

    assert classify_trailing_volume([10000, 12000, 14000]) == "rising"


def test_classify_skips_nulls():
    """None values are treated as missing weeks and skipped."""

    assert classify_trailing_volume([10000, 11000, None, 19000, 20000]) == "rising"


def test_classify_with_reason_success_has_no_reason():
    slope, reason = classify_trailing_volume_with_reason([10000, 12000, 14000, 18000])
    assert slope == "rising"
    assert reason is None


def test_classify_with_reason_insufficient_explains_missing_weeks():
    """The reason should mention how many weeks were logged vs how many were needed."""
    slope, reason = classify_trailing_volume_with_reason([10000, None, None, None, 14000, None])
    assert slope == "insufficient"
    assert reason is not None
    assert "2 of 6" in reason
    assert "3" in reason


def test_classify_with_reason_empty_window():
    slope, reason = classify_trailing_volume_with_reason([])
    assert slope == "insufficient"
    assert reason is not None
    assert "no volume history" in reason


def test_split_returns_averages():
    first, second = split_trailing_volume([10000, 12000, 18000, 20000])
    assert first == 11000.0
    assert second == 19000.0


def test_split_insufficient():
    first, second = split_trailing_volume([10000])
    assert first is None
    assert second is None


def test_aggregate_all_rising():
    profile, agreement = aggregate_profile(["rising", "rising", "rising", "rising", "rising"])
    assert profile == "rising"
    assert agreement == 1.0


def test_aggregate_majority_rising():
    """4 out of 5 rising = 80% agreement, above 60% threshold."""
    profile, agreement = aggregate_profile(["rising", "rising", "rising", "rising", "tapered"])
    assert profile == "rising"
    assert abs(agreement - 0.8) < 0.001


def test_aggregate_mixed():
    """2 rising, 2 tapered, 1 steady = 40% max agreement → mixed."""
    profile, agreement = aggregate_profile(["rising", "rising", "tapered", "tapered", "steady"])
    assert profile == "mixed"


def test_aggregate_ignores_insufficient():
    """Insufficient votes are dropped from the tally."""
    profile, _ = aggregate_profile(["rising", "rising", "insufficient", "insufficient"])
    assert profile == "rising"


def test_aggregate_all_insufficient():
    profile, agreement = aggregate_profile(["insufficient", "insufficient"])
    assert profile == "insufficient_data"
    assert agreement == 0.0


def test_aggregate_empty():
    profile, agreement = aggregate_profile([])
    assert profile == "insufficient_data"
    assert agreement == 0.0


def test_confidence_perfect_data():
    """24+ weeks, 100% RPE coverage, all peaks agree → near 100."""
    score, _ = compute_confidence(
        weeks_logged=30,
        rpe_coverage=1.0,
        pattern_agreement=1.0,
        peak_count=5,
    )
    assert score == 100


def test_confidence_no_rpe_but_seasoned():
    """Seasoned data with no RPE caps confidence around 60 (0.3 + 0.3 = 0.6)."""
    score, _ = compute_confidence(
        weeks_logged=30,
        rpe_coverage=0.0,
        pattern_agreement=1.0,
        peak_count=5,
    )
    assert score == 60


def test_confidence_low_data_volume():
    """6 weeks is a quarter of the target, so data_volume_score = 0.25."""
    score, subs = compute_confidence(
        weeks_logged=6,
        rpe_coverage=1.0,
        pattern_agreement=1.0,
        peak_count=5,
    )
    assert subs["data_volume_score"] == 0.25

    assert score == 78


def test_confidence_zero_peaks_kills_pattern_score():
    """With zero classified peaks, pattern-consistency is zeroed out."""
    score, subs = compute_confidence(
        weeks_logged=30,
        rpe_coverage=1.0,
        pattern_agreement=0.0,
        peak_count=0,
    )
    assert subs["pattern_consistency_score"] == 0.0

    assert score == 70


def test_confidence_no_rpe_tenant_redistributes_weight():
    """When the instance doesn't track RPE, the RPE component drops out and
    its weight is redistributed across data volume + pattern consistency
    so the score still tops out at 100."""
    score, _ = compute_confidence(
        weeks_logged=30,
        rpe_coverage=0.0,
        pattern_agreement=1.0,
        peak_count=5,
        rpe_tracked=False,
    )
    assert score == 100


def test_confidence_no_rpe_tenant_partial_data():
    """Half the data, full pattern agreement, no RPE: data 0.5 * 0.5 +
    pattern 1.0 * 0.5 = 0.75 → 75."""
    score, _ = compute_confidence(
        weeks_logged=12,
        rpe_coverage=0.0,
        pattern_agreement=1.0,
        peak_count=3,
        rpe_tracked=False,
    )
    assert score == 75


def test_explanation_no_rpe_tenant_skips_fallback_language():
    """The 'falling back to Epley' language should not appear when the
    instance has opted out of RPE tracking — Epley is the chosen method,
    not a fallback."""
    text = build_explanation(
        weeks_logged=20,
        rpe_coverage_pct=0.0,
        peak_count=3,
        top_n=5,
        profile="rising",
        rpe_tracked=False,
    )
    assert "falling back" not in text
    assert "RPE not tracked for this team" in text


def test_explanation_rpe_tenant_with_no_rpe_data_says_falling_back():
    """An RPE-tracking instance who happens to have no RPE data still gets
    the 'falling back' language — that's the data-quality signal."""
    text = build_explanation(
        weeks_logged=20,
        rpe_coverage_pct=0.0,
        peak_count=3,
        top_n=5,
        profile="rising",
        rpe_tracked=True,
    )
    assert "falling back to Epley" in text


def test_human_labels():
    assert profile_human_label("rising") == "Peaks off rising volume"
    assert profile_human_label("tapered") == "Peaks off tapered volume"
    assert profile_human_label("steady") == "Peaks off steady volume"
    assert profile_human_label("mixed") == "Mixed volume response"
    assert profile_human_label("insufficient_data") == "Insufficient data"
