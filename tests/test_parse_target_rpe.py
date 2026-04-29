"""Coverage for `_parse_target_rpe` — the tolerant RPE-cell extractor.

Coaches write prescribed RPE in many shapes. The parser must pull the
numeric target out of every reasonable form, including decimals like
``7.5``/``8.5``, so that compliance fill rates reflect the coach's real
prescription volume instead of silently skipping rows.
"""

from __future__ import annotations

import pytest

from bestrong.api.routes_analytics import _parse_target_rpe


@pytest.mark.parametrize(
    "raw, expected",
    [

        ("7", 7.0),
        ("8", 8.0),
        ("7.5", 7.5),
        ("8.5", 8.5),

        ("7-8", 7.5),
        ("7.5-8.5", 8.0),
        ("8 - 9", 8.5),

        ("@7", 7.0),
        ("@7.5", 7.5),
        ("@ 8.5", 8.5),
        ("~8", 8.0),
        ("~8.5", 8.5),

        ("RPE 8", 8.0),
        ("RPE 7.5", 7.5),
        ("@ 7 RPE", 7.0),
        ("rpe 8.5", 8.5),

        ("7+", 7.0),
        ("8.5+", 8.5),

        ("RPE 7-8", 7.5),
        ("@ 7.5-8.5 RPE", 8.0),

        ("75% @ 8", 8.0),
        ("8 @ 75%", 8.0),
    ],
)
def test_parse_extracts_numeric_target(raw: str, expected: float) -> None:
    assert _parse_target_rpe(raw) == pytest.approx(expected)


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "   ",
        "RPE?",
        "TBD",
        "—",

        "75%",
        "@ 75%",
    ],
)
def test_parse_returns_none_when_no_rpe_present(raw: str | None) -> None:
    assert _parse_target_rpe(raw) is None
