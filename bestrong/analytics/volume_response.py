"""Volume-response profile analytics.

Pure functions for classifying trailing volume trajectories before peak e1rms,
aggregating a per-athlete volume-response profile, and computing a confidence
score. The goal is to identify whether an athlete tends to peak after rising
volume (accumulation responder), tapered volume (intensification responder),
or steady volume.

Kept free of SQLAlchemy so the logic is unit-testable in isolation. The route
handler does the DB work and then hands sequences into these helpers.
"""

from __future__ import annotations


RISING_THRESHOLD = 1.10
TAPERED_THRESHOLD = 0.90


MIN_TRAILING_WEEKS = 3


DATA_VOLUME_WEIGHT = 0.3
RPE_COVERAGE_WEIGHT = 0.4
PATTERN_CONSISTENCY_WEIGHT = 0.3


FULL_DATA_WEEKS = 24


MIN_AGREEMENT_FRACTION = 0.60


def classify_trailing_volume(weekly_volumes: list[float | None]) -> str:
    """Classify a trailing-volume window as rising/tapered/steady/insufficient.

    Back-compat wrapper around classify_trailing_volume_with_reason. Returns
    just the slope label (no diagnostic reason).
    """
    slope, _ = classify_trailing_volume_with_reason(weekly_volumes)
    return slope


def classify_trailing_volume_with_reason(
    weekly_volumes: list[float | None],
) -> tuple[str, str | None]:
    """Classify a trailing-volume window AND return a human-readable reason.

    The input list is ordered oldest-to-newest, with the last element being
    the peak week itself. None/zero values are treated as "no training that
    week" and skipped for classification. If fewer than MIN_TRAILING_WEEKS
    non-null points are present, returns ("insufficient", reason).

    A simple first-half / second-half average comparison is used rather than
    a linear regression. This matches how a coach would eyeball the pattern
    ("did volume go up or down before the PR?") and it stays robust when
    there's a single spiky week.

    The reason string is None for successful classifications and a short
    diagnostic like "only 2 of 6 weeks logged before this peak" when we fall
    back to insufficient. The UI surfaces it in the peak legend so the user
    can see exactly why a peak didn't contribute to the profile.
    """
    total = len(weekly_volumes)
    clean = [v for v in weekly_volumes if v is not None and v > 0]
    if total == 0:
        return "insufficient", "no volume history before this peak"
    if len(clean) < MIN_TRAILING_WEEKS:
        return (
            "insufficient",
            f"only {len(clean)} of {total} weeks had volume logged before this peak "
            f"(need at least {MIN_TRAILING_WEEKS})",
        )

    mid = len(clean) // 2
    first_half = clean[:mid]
    second_half = clean[mid:]

    if not first_half or not second_half:
        return "insufficient", "not enough weeks to split into before/after halves"

    first_avg = sum(first_half) / len(first_half)
    second_avg = sum(second_half) / len(second_half)

    if first_avg == 0:
        return "insufficient", "trailing volume was all zero"

    ratio = second_avg / first_avg
    if ratio > RISING_THRESHOLD:
        return "rising", None
    if ratio < TAPERED_THRESHOLD:
        return "tapered", None
    return "steady", None


def split_trailing_volume(
    weekly_volumes: list[float | None],
) -> tuple[float | None, float | None]:
    """Return (first_half_avg, second_half_avg) for the trailing window.

    Used to expose the raw numbers in the API response so the UI can show
    them in a hover tooltip. None/zero values are skipped just like in
    classify_trailing_volume.
    """
    clean = [v for v in weekly_volumes if v is not None and v > 0]
    if len(clean) < 2:
        return None, None

    mid = len(clean) // 2
    first_half = clean[:mid]
    second_half = clean[mid:]

    if not first_half or not second_half:
        return None, None

    return (
        round(sum(first_half) / len(first_half), 1),
        round(sum(second_half) / len(second_half), 1),
    )


def aggregate_profile(peak_slopes: list[str]) -> tuple[str, float]:
    """Aggregate per-peak trailing-slope classifications into a single profile.

    Returns a (profile, agreement_fraction) tuple where profile is one of:
    rising, tapered, steady, mixed, insufficient_data. agreement_fraction is
    the share of peaks that agree with the chosen profile (0.0-1.0), used as
    an input to the confidence score.

    Rules:
    - Only rising/tapered/steady votes count toward the classification.
    - If no peaks have enough trailing data, returns ("insufficient_data", 0.0).
    - If the top vote is below MIN_AGREEMENT_FRACTION, returns ("mixed", fraction).
    """
    valid = [s for s in peak_slopes if s in ("rising", "tapered", "steady")]
    if not valid:
        return "insufficient_data", 0.0

    counts: dict[str, int] = {}
    for slope in valid:
        counts[slope] = counts.get(slope, 0) + 1

    top_label, top_count = max(counts.items(), key=lambda kv: kv[1])
    fraction = top_count / len(valid)

    if fraction < MIN_AGREEMENT_FRACTION:
        return "mixed", fraction

    return top_label, fraction


def compute_confidence(
    weeks_logged: int,
    rpe_coverage: float,
    pattern_agreement: float,
    peak_count: int,
    rpe_tracked: bool = True,
) -> tuple[int, dict]:
    """Compute a 0-100 confidence score for a volume-response profile.

    Args:
        weeks_logged: How many distinct training weeks we have for this lift.
        rpe_coverage: Fraction (0.0-1.0) of eligible top sets with usable RPE.
        pattern_agreement: Fraction (0.0-1.0) of top-N peaks agreeing on the
            chosen label. Pass 0.0 for "insufficient_data".
        peak_count: How many valid peaks were classified (not the total
            candidates, just the ones with enough trailing volume to score).
        rpe_tracked: When False, the instance doesn't log actual RPE by
            design. The RPE-coverage component is dropped and its weight
            is redistributed across data volume and pattern consistency
            so a no-RPE instance isn't permanently capped below 100.

    Returns:
        (score_0_to_100, components_dict) where components_dict contains the
        three sub-scores and the raw inputs, for UI display.
    """
    data_volume_score = min(1.0, max(0.0, weeks_logged / FULL_DATA_WEEKS))
    rpe_coverage_score = min(1.0, max(0.0, rpe_coverage))
    pattern_consistency_score = min(1.0, max(0.0, pattern_agreement))


    if peak_count == 0:
        pattern_consistency_score = 0.0

    if rpe_tracked:
        weighted = (
            data_volume_score * DATA_VOLUME_WEIGHT
            + rpe_coverage_score * RPE_COVERAGE_WEIGHT
            + pattern_consistency_score * PATTERN_CONSISTENCY_WEIGHT
        )
    else:


        remaining = DATA_VOLUME_WEIGHT + PATTERN_CONSISTENCY_WEIGHT
        weighted = (
            data_volume_score * (DATA_VOLUME_WEIGHT / remaining)
            + pattern_consistency_score * (PATTERN_CONSISTENCY_WEIGHT / remaining)
        )

    score = int(round(weighted * 100))

    return score, {
        "data_volume_score": round(data_volume_score, 3),
        "rpe_coverage_score": round(rpe_coverage_score, 3),
        "pattern_consistency_score": round(pattern_consistency_score, 3),
    }


def profile_human_label(profile: str) -> str:
    """Translate a profile code into a short human-readable label."""
    return {
        "rising": "Peaks off rising volume",
        "tapered": "Peaks off tapered volume",
        "steady": "Peaks off steady volume",
        "mixed": "Mixed volume response",
        "insufficient_data": "Insufficient data",
    }.get(profile, profile)


def build_explanation(
    weeks_logged: int,
    rpe_coverage_pct: float,
    peak_count: int,
    top_n: int,
    profile: str,
    rpe_tracked: bool = True,
) -> str:
    """Build a one-line explanation string shown as a tooltip on the confidence badge.

    When ``rpe_tracked`` is False the instance has opted out of RPE
    logging, so we don't frame the missing RPE as a data gap — for them
    Epley is the chosen method, not a fallback.
    """
    if profile == "insufficient_data":
        return (
            f"Only {weeks_logged} weeks of data logged. Need more history "
            "before a volume-response profile can be classified."
        )

    if not rpe_tracked:
        return (
            f"Based on {weeks_logged} weeks of data, RPE not tracked for this team, "
            f"{peak_count} of {top_n} peaks classified as {profile}."
        )

    rpe_part = (
        f"RPE recorded on {round(rpe_coverage_pct)}% of top sets"
        if rpe_coverage_pct > 0
        else "no RPE data (falling back to Epley estimates)"
    )
    return (
        f"Based on {weeks_logged} weeks of data, {rpe_part}, "
        f"{peak_count} of {top_n} peaks classified as {profile}."
    )
