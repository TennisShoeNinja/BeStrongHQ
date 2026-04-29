"""Tests for RPE value validation in the parser and analytics layers."""

from bestrong.parser.adapters.bestrong_parser import _parse_rpe_actual


class TestParseRpeActual:
    """Validate that _parse_rpe_actual rejects out-of-range values."""

    def test_valid_integer(self):
        assert _parse_rpe_actual(8) == (8.0, False)

    def test_valid_float(self):
        assert _parse_rpe_actual(7.5) == (7.5, False)

    def test_valid_boundary_low(self):
        assert _parse_rpe_actual(1) == (1.0, False)

    def test_valid_boundary_high(self):
        assert _parse_rpe_actual(10) == (10.0, False)

    def test_valid_string(self):
        assert _parse_rpe_actual("8.5") == (8.5, False)

    def test_rejects_weight_as_rpe(self):
        """A weight value like 251 should NOT be treated as RPE."""
        assert _parse_rpe_actual(251) == (None, False)

    def test_rejects_weight_as_rpe_float(self):
        assert _parse_rpe_actual(141.5) == (None, False)

    def test_rejects_volume_as_rpe(self):
        """A volume value like 5000 should NOT be treated as RPE."""
        assert _parse_rpe_actual(5000) == (None, False)

    def test_rejects_zero(self):
        assert _parse_rpe_actual(0) == (None, False)

    def test_rejects_negative(self):
        assert _parse_rpe_actual(-1) == (None, False)

    def test_rejects_above_10(self):
        assert _parse_rpe_actual(10.5) == (None, False)

    def test_rejects_weight_string(self):
        assert _parse_rpe_actual("315") == (None, False)

    def test_none(self):
        assert _parse_rpe_actual(None) == (None, False)

    def test_failed(self):
        assert _parse_rpe_actual("fail") == (None, True)

    def test_failed_case(self):
        assert _parse_rpe_actual("FAILED") == (None, True)

    def test_rpe_question_mark(self):
        assert _parse_rpe_actual("RPE?") == (None, False)

    def test_empty_string(self):
        assert _parse_rpe_actual("") == (None, False)

    def test_dash(self):
        assert _parse_rpe_actual("-") == (None, False)

    def test_non_numeric_string(self):
        assert _parse_rpe_actual("abc") == (None, False)
