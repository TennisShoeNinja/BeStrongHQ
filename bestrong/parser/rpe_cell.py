"""Parser for the "RPE Last Set" cell in athlete training spreadsheets.

Athletes type whatever comes to mind into the actual-RPE cell. A clean
number is the happy path; everything else is noise we need to classify:

* Literal `"fail"` / `"failed"`: the set missed, not an RPE miss-entry.
* Empty markers like `""`, `"-"`, `"RPE?"`: "didn't fill in", skip silently.
* Prescription leftovers like `"@ 7 RPE"`: the coach's target got pasted
  back into the actual column, we must NOT mistake it for a real RPE.
* Ranges and lists (`"7-8"`, `"7, 8, 9"`): pick the midpoint of the first
  two in-range numbers.
* Text around a valid number (`"rpe7"`, `"was maybe 7"`): extract the 7.
* Numbers just over 10 (`10.5`, `11`): a missed over-max attempt, treated
  as a failed lift (athletes log this instead of writing "fail").
* Numbers well outside the scale (`67`, `910`, `0`): a typo or misplaced
  weight, flagged for coach review with the raw value stashed.
* Random junk with no number (`"idk"`): too ambiguous to flag, drop it.

Kept as a pure stdlib helper so it's trivially unit-testable and doesn't
drag spreadsheet/Excel concerns into its contract. The caller decides how
to persist `needs_review` and the raw string.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


_RPE_MIN = 1.0
_RPE_MAX = 10.0

# A number just above 10 is read as a failed lift: athletes log "10.5" / "11"
# to mean "I went past my true max and missed it" rather than writing "fail".
# Above this ceiling the value is implausible as an RPE (a misplaced weight or a
# typo like 67 / 910 / 6778), so it stays a review item instead of a fail.
_FAIL_RPE_CEILING = 12.0


_BLANK_MARKERS = {"", "-", "rpe?"}


@dataclass(frozen=True)
class RPECell:
    """Structured result of parsing a single RPE cell.

    Attributes:
        parsed: The usable RPE value in [1, 10], or None when the cell
            yielded no trustworthy number. For ranges/lists this is the
            midpoint of the first two in-range numbers.
        failed: True for a missed lift: the literal ``fail`` / ``failed``
            text, or a number just above 10 (the team's shorthand for an
            over-max miss). Mutually exclusive with a non-None ``parsed``.
        needs_review: True when a number was present but implausible as an
            RPE (well outside [1, 10], e.g. a misplaced weight or a typo
            like 67 / 910) with no in-range number to fall back on. Signals
            "coach, take a look".
        raw: The verbatim cell text (or ``str(value)`` for numeric types),
            kept for the review UI or to show the original value on an
            over-max fail. None when there is nothing worth keeping.
    """

    parsed: float | None
    failed: bool
    needs_review: bool
    raw: str | None


def _empty() -> RPECell:
    """Sentinel for "nothing to see here": blanks, junk, @-prescriptions."""
    return RPECell(parsed=None, failed=False, needs_review=False, raw=None)


def _failed(raw: str | None = None) -> RPECell:
    """Sentinel for a failed lift: the literal fail/failed strings, or an RPE
    logged just above 10 (the team's shorthand for a missed attempt). ``raw`` is
    kept for the over-max case so the original value stays visible."""
    return RPECell(parsed=None, failed=True, needs_review=False, raw=raw)


def _review(raw: str) -> RPECell:
    """Sentinel for "number present but out of range", stashed for audit."""
    return RPECell(parsed=None, failed=False, needs_review=True, raw=raw)


def _in_range(n: float) -> bool:
    """True when n is a legal RPE on the 1–10 scale."""
    return _RPE_MIN <= n <= _RPE_MAX


def _is_over_max_fail(n: float) -> bool:
    """True when n reads as a missed over-max attempt (just above 10)."""
    return _RPE_MAX < n <= _FAIL_RPE_CEILING


def parse_rpe_cell(value: object) -> RPECell:
    """Parse the messy "RPE Last Set" cell value into a structured result.

    Recognises:

    * ``None`` and blank markers (``""``, ``"-"``, ``"RPE?"``): empty.
    * ``fail`` / ``failed`` (case-insensitive): the set failed.
    * Raw ints/floats in [1, 10]: parsed as-is.
    * Raw ints/floats just over 10 (10.5, 11, up to 12): a failed lift.
    * Raw ints/floats further out (85, 910) or below 1 (0, -3): flagged for
      review with the raw value preserved.
    * Strings containing ``@`` (prescription leftover, e.g. ``"@ 7 RPE"``):
      empty, since we refuse to extract a number that is the *target*, not
      the actual.
    * Strings with embedded numbers: first two in-range numbers give the
      midpoint; one in-range number gives that number; no in-range number
      but an over-max one (10.5, 11) is a failed lift; otherwise flagged for
      review with the raw string; no numbers at all is empty.
    * Anything else (datetime, etc.): empty.

    The function is deterministic: identical input → identical output on
    every call. No global state, no randomness.

    Args:
        value: Whatever openpyxl / the CSV layer handed us for the cell.
            Expected to be ``None``, ``int``, ``float``, or ``str``, but
            tolerates other types by treating them as empty.

    Returns:
        An ``RPECell`` describing what we found. Exactly one of
        ``parsed`` / ``failed`` / ``needs_review`` carries the signal for
        any given cell (or all three are falsy, for a silent blank).
    """

    if value is None:
        return _empty()


    if isinstance(value, (int, float)) and not isinstance(value, bool):
        n = float(value)
        if _in_range(n):
            return RPECell(parsed=n, failed=False, needs_review=False, raw=None)

        if _is_over_max_fail(n):
            return _failed(str(value))

        return _review(str(value))


    if isinstance(value, str):
        stripped = value.strip()


        if stripped.lower() in _BLANK_MARKERS:
            return _empty()


        if stripped.lower() in ("fail", "failed"):
            return _failed()


        if "@" in stripped:
            return _empty()


        numbers = [float(m) for m in _NUMBER_RE.findall(stripped)]

        if not numbers:


            return _empty()

        in_range = [n for n in numbers if _in_range(n)]

        if not in_range:
            # An over-max number (10.5, 11) reads as a missed attempt; a wildly
            # out-of-range one (67, 910) is a typo or misplaced weight to review.
            if any(_is_over_max_fail(n) for n in numbers):
                return _failed(value)
            return _review(value)

        if len(in_range) == 1:


            return RPECell(
                parsed=in_range[0], failed=False, needs_review=False, raw=None
            )


        midpoint = (in_range[0] + in_range[1]) / 2.0
        return RPECell(
            parsed=midpoint, failed=False, needs_review=False, raw=None
        )


    return _empty()
