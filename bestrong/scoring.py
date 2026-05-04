"""IPF GL Points (Goodlift) calculator.

DOTS comes from the OpenPowerlifting CSV directly, but IPF GL Points are
not in the CSV, so we compute them at import time from total + bodyweight
+ sex + equipment using the post-2020 IPF formula:

    GL = 100 / (a - b * exp(-c * BW)) * Total

with sex/equipment-specific coefficients.

Bodyweight and total are both in kilograms.
"""

from __future__ import annotations

import math


# IPF GL Points coefficients (a, b, c). Values from the official IPF
# scoring tables; raw vs. equipped (single-ply) use distinct coefficients.
_GL_COEFFS: dict[tuple[str, str], tuple[float, float, float]] = {
    ("M", "raw"): (1199.72839, 1025.18162, 0.00921),
    ("F", "raw"): (610.32796, 1045.59282, 0.03048),
    ("M", "equipped"): (1236.25115, 1449.21864, 0.01644),
    ("F", "equipped"): (758.63878, 949.31382, 0.02435),
}


def _normalize_sex(sex: str | None) -> str | None:
    if not sex:
        return None
    s = sex.strip().upper()
    if s.startswith("M"):
        return "M"
    if s.startswith("F") or s.startswith("W"):
        return "F"
    return None


def _normalize_equipment(equipment: str | None) -> str:
    """Map OPL equipment string to {raw, equipped}.

    OPL uses Raw / Wraps / Single-ply / Multi-ply / Unlimited. For GL
    coefficients only Raw and Equipped (single/multi-ply) are split.
    Wraps count as Raw for GL Points purposes per IPF tables. Default to
    raw when the value is unknown so we still produce a number rather
    than a hole in the chart.
    """
    if not equipment:
        return "raw"
    e = equipment.strip().lower()
    if "single" in e or "multi" in e or "equip" in e:
        return "equipped"
    return "raw"


def gl_points(
    total_kg: float | None,
    bodyweight_kg: float | None,
    sex: str | None,
    equipment: str | None = None,
) -> float | None:
    """Return IPF GL Points or None if any required input is missing/invalid."""
    if total_kg is None or bodyweight_kg is None:
        return None
    if total_kg <= 0 or bodyweight_kg <= 0:
        return None
    sex_n = _normalize_sex(sex)
    if sex_n is None:
        return None
    equip_n = _normalize_equipment(equipment)
    coeffs = _GL_COEFFS.get((sex_n, equip_n))
    if coeffs is None:
        return None
    a, b, c = coeffs
    denom = a - b * math.exp(-c * bodyweight_kg)
    if denom <= 0:
        return None
    score = 100.0 / denom * total_kg
    return round(score, 2)
