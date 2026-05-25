"""Tests for the RPE cell parser.

Each test case is a single shape of input we've seen (or could plausibly
see) in the "RPE Last Set" column of an athlete's training sheet. The
parser is a pure function so these tests stay tiny — no fixtures, no
mocks, just input → RPECell.
"""

import datetime

import pytest

from bestrong.parser.rpe_cell import RPECell, parse_rpe_cell


def test_none_is_silent_blank():
    """None (empty cell from openpyxl) → everything falsy."""
    assert parse_rpe_cell(None) == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


@pytest.mark.parametrize("blank", ["", "-", "RPE?", "rpe?", "Rpe?", "   ", "\t", "\n"])
def test_blank_markers_are_silent(blank):
    """Any explicit "didn't fill this in" marker → silent blank.

    Covers empty string, hyphen placeholder, the common "RPE?" note,
    its case variants, and pure-whitespace cells.
    """
    result = parse_rpe_cell(blank)
    assert result == RPECell(parsed=None, failed=False, needs_review=False, raw=None)


@pytest.mark.parametrize("text", ["fail", "Fail", "FAIL", "failed", "Failed", "FAILED"])
def test_fail_variants_set_failed_flag(text):
    """Exactly 'fail' or 'failed' (any case) → failed=True, nothing else."""
    result = parse_rpe_cell(text)
    assert result == RPECell(parsed=None, failed=True, needs_review=False, raw=None)


def test_fail_with_surrounding_whitespace():
    """' fail ' still counts — we strip before matching."""
    assert parse_rpe_cell("  failed  ") == RPECell(
        parsed=None, failed=True, needs_review=False, raw=None
    )


@pytest.mark.parametrize("n", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
def test_integer_in_range(n):
    """Every integer in [1, 10] parses to its float equivalent."""
    assert parse_rpe_cell(n) == RPECell(
        parsed=float(n), failed=False, needs_review=False, raw=None
    )


@pytest.mark.parametrize("n,expected", [(7.5, 7.5), (6.5, 6.5), (1.0, 1.0), (10.0, 10.0)])
def test_float_in_range(n, expected):
    """Floats in [1, 10] — including the inclusive endpoints — parse."""
    assert parse_rpe_cell(n) == RPECell(
        parsed=expected, failed=False, needs_review=False, raw=None
    )


@pytest.mark.parametrize("s,expected", [("1", 1.0), ("7", 7.0), ("10", 10.0), ("7.5", 7.5), ("6.5", 6.5)])
def test_string_numeric_in_range(s, expected):
    """Plain-number strings behave the same as numeric types."""
    assert parse_rpe_cell(s) == RPECell(
        parsed=expected, failed=False, needs_review=False, raw=None
    )


@pytest.mark.parametrize("n", [85, -3, 0, 100.5, 0.5, 12.5, 13])
def test_out_of_range_numeric_needs_review(n):
    """Numbers well outside the scale are flagged AND retain the raw value.

    Covers the classic 'weight-in-wrong-column' case (85, 100.5), below-1
    misses (0, 0.5, -3), and values above the over-max fail band (12.5, 13)
    that read as typos rather than a missed attempt.
    """
    result = parse_rpe_cell(n)
    assert result.parsed is None
    assert result.failed is False
    assert result.needs_review is True
    assert result.raw == str(n)


@pytest.mark.parametrize("n", [10.5, 11, 12, 10.1])
def test_over_max_numeric_is_failed(n):
    """A number just above 10 is the team's shorthand for a missed lift, so it
    parses as a failed attempt rather than a review item."""
    result = parse_rpe_cell(n)
    assert result.parsed is None
    assert result.failed is True
    assert result.needs_review is False


@pytest.mark.parametrize("text", ["7-8", "7 - 8", "7to8", "7 to 8", "7, 8"])
def test_two_number_string_yields_midpoint(text):
    """Any separator between two in-range numbers → midpoint of the pair."""
    assert parse_rpe_cell(text) == RPECell(
        parsed=7.5, failed=False, needs_review=False, raw=None
    )


def test_three_number_string_takes_first_two():
    """'7, 8, 9' → midpoint of 7 and 8, ignoring 9. Matches spec."""
    assert parse_rpe_cell("7, 8, 9") == RPECell(
        parsed=7.5, failed=False, needs_review=False, raw=None
    )


def test_wider_range_midpoint():
    """'7-9' → 8.0 (midpoint of 7 and 9), not 7 or 9 alone."""
    assert parse_rpe_cell("7-9") == RPECell(
        parsed=8.0, failed=False, needs_review=False, raw=None
    )


def test_midpoint_stays_in_range():
    """Even at the extremes (1 and 10), the midpoint is still in [1, 10]."""
    result = parse_rpe_cell("1-10")
    assert result.parsed == 5.5
    assert result.needs_review is False


def test_at_symbol_with_single_number_is_silent():
    """'@ 7 RPE' is prescription — refuse to extract, silent blank."""
    assert parse_rpe_cell("@ 7 RPE") == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


def test_at_symbol_with_range_is_silent():
    """'@ 7-8 RPE' — @ wins even when a parseable range is present."""
    assert parse_rpe_cell("@ 7-8 RPE") == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


def test_at_symbol_anywhere_in_string_is_silent():
    """The @ check is substring, not prefix — catches pasted artifacts."""
    assert parse_rpe_cell("did 7 @ the top set") == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


@pytest.mark.parametrize("text", ["rpe7", "RPE 7", "was maybe 7", "felt like a 7"])
def test_text_around_single_in_range_number_parses(text):
    """Stray text before/after a valid number still extracts the number."""
    assert parse_rpe_cell(text) == RPECell(
        parsed=7.0, failed=False, needs_review=False, raw=None
    )


@pytest.mark.parametrize("text", ["85 lbs", "went up to 85", "225"])
def test_all_out_of_range_numbers_in_string_flag_review(text):
    """Every number is outside [1, 10] → needs review, raw preserved."""
    result = parse_rpe_cell(text)
    assert result.parsed is None
    assert result.failed is False
    assert result.needs_review is True
    assert result.raw == text


@pytest.mark.parametrize("text", ["idk", "skipped", "hard", "easy day", "???"])
def test_non_numeric_junk_is_silent(text):
    """No digits at all → too ambiguous to flag, silent blank."""
    assert parse_rpe_cell(text) == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


def test_mixed_in_and_out_of_range_picks_in_range():
    """'7 (was 85)' — 7 is usable, 85 is not. Take 7, don't flag."""
    assert parse_rpe_cell("7 (was 85)") == RPECell(
        parsed=7.0, failed=False, needs_review=False, raw=None
    )


def test_multiple_in_range_with_out_of_range_sibling():
    """'7-8 at 225 lbs' — two in-range numbers form a midpoint, 225 is
    ignored. No review flag because we already got a usable value."""
    result = parse_rpe_cell("7-8 at 225 lbs")
    assert result.parsed == 7.5
    assert result.needs_review is False
    assert result.raw is None


def test_datetime_is_silent():
    """A datetime object (Excel auto-conversion quirk) → silent blank."""
    dt = datetime.datetime(2026, 4, 17, 12, 0, 0)
    assert parse_rpe_cell(dt) == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


def test_date_is_silent():
    """A bare date object — same handling as datetime."""
    d = datetime.date(2026, 4, 17)
    assert parse_rpe_cell(d) == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


def test_list_is_silent():
    """Some other weird type (shouldn't happen in practice)."""
    assert parse_rpe_cell([7, 8]) == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


def test_bool_is_not_parsed_as_number():
    """Booleans are int subclasses; ensure we don't treat True as 1.0."""


    assert parse_rpe_cell(True) == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )
    assert parse_rpe_cell(False) == RPECell(
        parsed=None, failed=False, needs_review=False, raw=None
    )


def test_determinism_across_repeated_calls():
    """Same input → identical RPECell every call. No hidden state."""
    inputs = [
        None, "", "-", "RPE?", "fail", "Failed", 7, 7.5, "7", "7.5",
        85, -3, 0, 11, "7-8", "7 to 8", "7, 8, 9", "@ 7 RPE",
        "rpe7", "85 lbs", "idk", "7 (was 85)",
    ]
    firsts = [parse_rpe_cell(v) for v in inputs]
    seconds = [parse_rpe_cell(v) for v in inputs]
    assert firsts == seconds


def test_parsed_never_exceeds_range_across_broad_sweep():
    """Whatever we accept, the parsed value must live in [1, 10] or be None."""
    samples = [
        None, "", "-", "RPE?", "fail", 7, 7.5, "7", "7.5", 85, -3, 0, 11,
        "7-8", "7 - 8", "7to8", "7, 8, 9", "1-10", "@ 7 RPE", "rpe7",
        "85 lbs", "idk", "7 (was 85)",
    ]
    for s in samples:
        result = parse_rpe_cell(s)
        if result.parsed is not None:
            assert 1.0 <= result.parsed <= 10.0, f"out of range for {s!r}: {result.parsed}"


def test_raw_only_set_when_needs_review():
    """Invariant: raw is None unless needs_review is True."""
    samples = [
        None, "", "fail", 7, 7.5, "7-8", "@ 7 RPE", "rpe7", "idk",
        "7 (was 85)", 85, "85 lbs",
    ]
    for s in samples:
        result = parse_rpe_cell(s)
        if result.needs_review:
            assert result.raw is not None, f"needs_review but raw is None: {s!r}"
        else:
            assert result.raw is None, f"raw set without needs_review: {s!r}"


def test_failed_and_parsed_are_mutually_exclusive():
    """failed=True never coexists with a non-None parsed value."""
    samples = [
        None, "", "fail", "failed", 7, 7.5, "7-8", "@ 7 RPE", "rpe7",
        "idk", 85, "85 lbs", "7 (was 85)",
    ]
    for s in samples:
        result = parse_rpe_cell(s)
        if result.failed:
            assert result.parsed is None, f"failed and parsed both set: {s!r}"
