"""Parser for the "RPE Last Set" cell in athlete training spreadsheets.

Athletes type whatever comes to mind into the actual-RPE cell. A clean
number is the happy path; everything else is noise we need to classify:

* Literal `"fail"` / `"failed"` — the set missed, not an RPE miss-entry.
* Empty markers like `""`, `"-"`, `"RPE?"` — "didn't fill in", skip silently.
* Prescription leftovers like `"@ 7 RPE"` — the coach's target got pasted
  back into the actual column, we must NOT mistake it for a real RPE.
* Ranges and lists (`"7-8"`, `"7, 8, 9"`) — pick the midpoint of the first
  two in-range numbers.
* Text around a valid number (`"rpe7"`, `"was maybe 7"`) — extract the 7.
* Numbers outside [1, 10] — almost always a weight that slid over from the
  wrong column; flag for coach review and stash the raw value.
* Random junk with no number (`"idk"`) — too ambiguous to flag, drop it.

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


_BLANK_MARKERS = {"", "-", "rpe?"}


@dataclass(frozen=True)
class RPECell:
    """Structured result of parsing a single RPE cell.

    Attributes:
        parsed: The usable RPE value in [1, 10], or None when the cell
            yielded no trustworthy number. For ranges/lists this is the
            midpoint of the first two in-range numbers.
        failed: True when the cell text is exactly ``fail`` or ``failed``
            (case-insensitive, whitespace-stripped). Mutually exclusive
            with a non-None ``parsed`` by construction.
        needs_review: True when a number was present but outside [1, 10]
            and we couldn't find any other in-range number to fall back
            on. Signals "coach, take a look" rather than "this is
            definitively broken".
        raw: The verbatim cell text (or ``str(value)`` for numeric types)
            preserved for the coach's review UI. Only set when
            ``needs_review`` is True; None otherwise so we don't bloat
            storage with every filled-in RPE.
    """

    parsed: float | None
    failed: bool
    needs_review: bool
    raw: str | None


def _empty() -> RPECell:
    """Sentinel for "nothing to see here" — blanks, junk, @-prescriptions."""
    return RPECell(parsed=None, failed=False, needs_review=False, raw=None)


def _failed() -> RPECell:
    """Sentinel for the literal fail/failed strings."""
    return RPECell(parsed=None, failed=True, needs_review=False, raw=None)


def _review(raw: str) -> RPECell:
    """Sentinel for "number present but out of range" — stash for audit."""
    return RPECell(parsed=None, failed=False, needs_review=True, raw=raw)


def _in_range(n: float) -> bool:
    """True when n is a legal RPE on the 1–10 scale."""
    return _RPE_MIN <= n <= _RPE_MAX


def parse_rpe_cell(value: object) -> RPECell:
    """Parse the messy "RPE Last Set" cell value into a structured result.

    Recognises:

    * ``None`` and blank markers (``""``, ``"-"``, ``"RPE?"``): empty.
    * ``fail`` / ``failed`` (case-insensitive): the set failed.
    * Raw ints/floats in [1, 10]: parsed as-is.
    * Raw ints/floats out of range (e.g. 85, -3, 0, 11): flagged for
      review with the raw value preserved.
    * Strings containing ``@`` (prescription leftover, e.g. ``"@ 7 RPE"``):
      empty — we refuse to extract a number because it's the *target*,
      not the actual.
    * Strings with embedded numbers: first two in-range numbers → midpoint;
      one in-range number → that number; zero in-range but at least one
      out-of-range number → flagged for review with the raw string; no
      numbers at all → empty (too ambiguous to flag).
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
