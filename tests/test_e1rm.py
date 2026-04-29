"""Tests for E1RM calculation using the RPE percentage table."""

from bestrong.analytics.e1rm import calculate_e1rm, calculate_e1rm_for_entries


def test_1rm_at_rpe10():
    """1 rep at RPE 10 = 100% → E1RM equals the weight lifted."""
    assert calculate_e1rm(400.0, 1, 10.0) == 400.0


def test_3_reps_at_rpe8():
    """3 reps at RPE 8 = 86.3% → E1RM = weight / 0.863."""
    result = calculate_e1rm(300.0, 3, 8.0)
    assert result is not None
    assert abs(result - 347.6) < 1.0


def test_5_reps_at_rpe9():
    """5 reps at RPE 9 = 83.7% → E1RM = weight / 0.837."""
    result = calculate_e1rm(225.0, 5, 9.0)
    assert result is not None
    assert abs(result - 268.8) < 1.0


def test_rpe_snapping():
    """RPE 8.3 should snap to 8.5."""
    result_exact = calculate_e1rm(300.0, 3, 8.5)
    result_snapped = calculate_e1rm(300.0, 3, 8.3)
    assert result_exact == result_snapped


def test_rpe_below_6_returns_none():
    """RPE below 6 is outside the table — return None."""
    assert calculate_e1rm(300.0, 3, 5.0) is None


def test_zero_weight_returns_none():
    assert calculate_e1rm(0.0, 3, 8.0) is None


def test_none_inputs_return_none():
    assert calculate_e1rm(None, 3, 8.0) is None
    assert calculate_e1rm(300.0, None, 8.0) is None
    assert calculate_e1rm(300.0, 3, None) is None


def test_high_reps_clamped_to_12():
    """Reps above 12 should clamp to 12 and still produce a result."""
    result_12 = calculate_e1rm(135.0, 12, 8.0)
    result_15 = calculate_e1rm(135.0, 15, 8.0)
    assert result_12 == result_15


def test_batch_calculation():
    """Test calculate_e1rm_for_entries with a list of exercise entries."""
    entries = [
        {"weight_lbs": 400.0, "reps": 1, "actual_rpe": 10.0, "exercise_name": "Squat"},
        {"weight_lbs": 300.0, "reps": 3, "actual_rpe": 8.0, "exercise_name": "Bench"},
        {"weight_lbs": None, "reps": 5, "actual_rpe": 8.0, "exercise_name": "Accessory"},
    ]
    results = calculate_e1rm_for_entries(entries)

    assert len(results) == 3
    assert results[0]["e1rm"] == 400.0
    assert results[0]["exercise_name"] == "Squat"
    assert results[1]["e1rm"] is not None
    assert results[2]["e1rm"] is None
