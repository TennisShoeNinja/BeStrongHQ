"""Tests for IPF GL Points scoring."""

import pytest

from bestrong.scoring import _normalize_equipment, _normalize_sex, gl_points


@pytest.mark.parametrize(
    ("total_kg", "bodyweight_kg", "sex", "equipment", "expected"),
    [
        (700.0, 83.0, "M", "Raw", 96.90),
        (450.0, 63.0, "F", "Raw", 98.45),
        (900.0, 120.0, "M", "Single-ply", 86.98),
        (550.0, 72.0, "F", "equipped", 92.56),
    ],
)
def test_gl_points_matches_ipf_reference_values(
    total_kg, bodyweight_kg, sex, equipment, expected
):
    # IPF GL formula: GL = 100 / (a - b * exp(-c * bodyweight)) * total.
    assert gl_points(total_kg, bodyweight_kg, sex, equipment) == expected


def test_gl_points_scales_linearly_with_total():
    baseline = gl_points(500.0, 90.0, "M", "Raw")
    doubled = gl_points(1000.0, 90.0, "M", "Raw")

    assert baseline is not None
    assert doubled == pytest.approx(baseline * 2, abs=0.02)


def test_gl_points_positive_for_valid_input():
    result = gl_points(300.0, 60.0, "F", "Raw")

    assert result is not None
    assert result > 0


@pytest.mark.parametrize("sex", [None, "", "unknown"])
def test_gl_points_returns_none_for_missing_or_unknown_sex(sex):
    assert gl_points(500.0, 90.0, sex, "Raw") is None


@pytest.mark.parametrize("equipment", [None, "", "unknown", "Wraps"])
def test_gl_points_defaults_missing_or_unknown_equipment_to_raw(equipment):
    assert gl_points(500.0, 90.0, "M", equipment) == gl_points(
        500.0, 90.0, "M", "Raw"
    )


@pytest.mark.parametrize("bodyweight_kg", [0.0, -90.0])
def test_gl_points_returns_none_for_zero_or_negative_bodyweight(bodyweight_kg):
    assert gl_points(500.0, bodyweight_kg, "M", "Raw") is None


@pytest.mark.parametrize("total_kg", [0.0, -500.0])
def test_gl_points_returns_none_for_zero_or_negative_total(total_kg):
    assert gl_points(total_kg, 90.0, "M", "Raw") is None


def test_gl_points_returns_none_for_missing_total_or_bodyweight():
    assert gl_points(None, 90.0, "M", "Raw") is None
    assert gl_points(500.0, None, "M", "Raw") is None


@pytest.mark.parametrize(
    ("sex", "expected"),
    [
        ("male", "M"),
        (" Female ", "F"),
        ("woman", "F"),
        (None, None),
        ("", None),
        ("unknown", None),
    ],
)
def test_normalize_sex(sex, expected):
    assert _normalize_sex(sex) == expected


@pytest.mark.parametrize(
    ("equipment", "expected"),
    [
        ("Raw", "raw"),
        ("Wraps", "raw"),
        ("Single-ply", "equipped"),
        ("Multi-ply", "equipped"),
        ("Equipped", "equipped"),
        (None, "raw"),
        ("unknown", "raw"),
    ],
)
def test_normalize_equipment(equipment, expected):
    assert _normalize_equipment(equipment) == expected
