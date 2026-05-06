"""Utility for tracking changes to athlete max lifts."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session as DBSession

from ..models.orm import Athlete, MaxHistory, MeetResult


MAX_FIELDS = {
    "squat_max_lbs": "squat",
    "bench_max_lbs": "bench",
    "deadlift_max_lbs": "deadlift",
    "total_lbs": "total",
}


COMPETITION_LIFTS = ("squat", "bench", "deadlift")
MAX_FIELD_BY_LIFT = {
    "squat": "squat_max_lbs",
    "bench": "bench_max_lbs",
    "deadlift": "deadlift_max_lbs",
}

# Canonical exercise_name written to MaxHistory for the per-exercise PR
# lane corresponding to each competition lift. Keeps comp results visible
# in the same progression series the athlete profile shows for training
# 1RMs, so a coach reading "Competition Deadlift / 1RM" sees both meet
# and gym entries on the same timeline.
CANONICAL_COMP_LANE_NAME = {
    "squat": "Competition Squat",
    "bench": "Competition Bench Press",
    "deadlift": "Competition Deadlift",
}

# Meets older than this don't drive the cached max. Backdated imports
# (a five-year-old PR auto-syncing from OPL) overwhelmingly don't
# reflect current capability — old equipment, retired weight classes,
# layoffs, peaking phases that aren't repeatable. The meet still imports
# into history; it just doesn't bump the cached value. NULL meet_date
# is treated as "modern" for backward compatibility with manual entries
# where coaches didn't fill in a date.
MEET_RECENCY_CUTOFF_DAYS = 730


def _meet_recency_cutoff() -> str:
    """ISO date string for the oldest meet that still contributes to maxes."""
    return (
        datetime.now(timezone.utc).replace(tzinfo=None)
        - timedelta(days=MEET_RECENCY_CUTOFF_DAYS)
    ).strftime("%Y-%m-%d")

# MaxHistory.source values whose new_value should NOT contribute as a
# non-meet floor when reconciling. Meet-derived rows can disappear with
# their backing MeetResult; we want the recompute to fall back to other
# evidence (training PRs, declared baselines) instead of using the
# stale meet-derived MaxHistory entry as a floor.
_MEET_DERIVED_HISTORY_SOURCES = frozenset({"meet", "opl", "opl_resync"})


def recompute_canonical_max(db: DBSession, athlete: Athlete, lift: str) -> float | None:
    """Compute what ``athlete.<lift>_max_lbs`` should be from current evidence.

    Pieces of evidence:

    * The heaviest made attempt across MeetResult rows whose meet_date is
      within ``MEET_RECENCY_CUTOFF_DAYS``. Old meets stay in history but
      don't drive the cached max — a five-year-old PR isn't a useful
      programming anchor. NULL meet_date is treated as "modern" for
      backward compat with manual entries that omit the date.
    * The highest non-meet ``new_value`` ever recorded in MaxHistory:
      program imports tag rows with ``source='import'`` (training PRs
      from singles in spreadsheets), manual edits with ``'manual'``,
      etc. These act as a floor that survives meet-result removal.
    * The ``old_value`` of the very first MaxHistory row for this lift,
      which captures the value the coach declared on profile creation
      before anything else mutated the field.

    Returns ``None`` when no evidence exists for the lift. Routine
    flows only add evidence and so can only raise this value; demotions
    only happen when evidence is removed (OPL retires a record, coach
    deletes a meet result), in which case the cached value falls back
    to whatever remaining evidence supports.
    """
    cutoff = _meet_recency_cutoff()
    best_meet = (
        db.query(func.max(MeetResult.weight_lbs))
        .filter(
            MeetResult.athlete_id == athlete.id,
            MeetResult.lift == lift,
            MeetResult.made.is_(True),
            or_(MeetResult.meet_date.is_(None), MeetResult.meet_date >= cutoff),
        )
        .scalar()
    )

    best_non_meet = (
        db.query(func.max(MaxHistory.new_value))
        .filter(
            MaxHistory.athlete_id == athlete.id,
            MaxHistory.lift == lift,
            MaxHistory.source.notin_(_MEET_DERIVED_HISTORY_SOURCES),
        )
        .scalar()
    )

    first_entry = (
        db.query(MaxHistory)
        .filter(MaxHistory.athlete_id == athlete.id, MaxHistory.lift == lift)
        .order_by(MaxHistory.id.asc())
        .first()
    )
    declared_baseline = first_entry.old_value if first_entry else None

    candidates = [v for v in (best_meet, best_non_meet, declared_baseline) if v is not None]
    return max(candidates) if candidates else None


def reconcile_competition_maxes(
    db: DBSession,
    athlete: Athlete,
    *,
    source: str,
    note: str | None = None,
) -> None:
    """Recompute cached competition maxes from current evidence and apply
    any deltas, logging changes via ``log_max_changes``.

    Use this after meet evidence has changed in a way that could demote
    the cached value: OPL refresh/relink/unlink, manual meet-result
    delete or replace. Recompute returning ``None`` for a lift (no
    evidence at all) is treated as "leave the field alone" — this only
    happens when the athlete has no history rows for the lift, so the
    current cached value is whatever the coach typed in directly and we
    don't want to clear it.
    """
    updates: dict[str, float] = {}
    for lift in COMPETITION_LIFTS:
        new_value = recompute_canonical_max(db, athlete, lift)
        if new_value is None:
            continue
        field = MAX_FIELD_BY_LIFT[lift]
        if getattr(athlete, field) != new_value:
            updates[field] = new_value

    if not updates:
        return

    new_squat = updates.get("squat_max_lbs", athlete.squat_max_lbs)
    new_bench = updates.get("bench_max_lbs", athlete.bench_max_lbs)
    new_deadlift = updates.get("deadlift_max_lbs", athlete.deadlift_max_lbs)
    if None not in (new_squat, new_bench, new_deadlift):
        updates["total_lbs"] = new_squat + new_bench + new_deadlift

    log_max_changes(db, athlete, updates, source=source, note=note)
    for field, value in updates.items():
        setattr(athlete, field, value)


def _meet_date_to_datetime(meet_date_str: str | None) -> datetime:
    """Coerce a MeetResult.meet_date (ISO string or None) to a datetime
    suitable for ``MaxHistory.recorded_at``. Falls back to ``utcnow`` when
    the string is missing or unparseable so the row still lands at a
    sensible spot on the timeline."""
    if meet_date_str:
        try:
            return datetime.combine(date.fromisoformat(meet_date_str), datetime.min.time())
        except (ValueError, TypeError):
            pass
    return datetime.utcnow()


def sync_competition_lane_prs(
    db: DBSession,
    athlete_id: int,
    *,
    source: str = "meet",
) -> int:
    """Ensure each competition lift's per-exercise PR lane reflects the
    athlete's all-time best made attempt across every MeetResult on
    record.

    The athlete-profile PR card and "Competition <Lift> / 1RM" modal
    both pull from MaxHistory rows with a populated ``exercise_name`` +
    ``reps``. Comp results otherwise only update the lift-cap fields
    (squat_max_lbs etc.) and write MaxHistory rows with no
    exercise_name, so the per-exercise lane misses them entirely.
    Without this sync, a training single matching a comp PR reads as a
    new PR over the prior training value instead of a tie of the
    athlete's actual best.

    No-op for any lift whose lane top already meets or exceeds the
    current best meet attempt. Returns the number of rows written.
    """
    written = 0
    for lift in COMPETITION_LIFTS:
        best_row = (
            db.query(MeetResult)
            .filter(
                MeetResult.athlete_id == athlete_id,
                MeetResult.lift == lift,
                MeetResult.made.is_(True),
            )
            .order_by(MeetResult.weight_lbs.desc(), MeetResult.id.asc())
            .first()
        )
        if best_row is None:
            continue
        canonical_name = CANONICAL_COMP_LANE_NAME[lift]
        prior = (
            db.query(func.max(MaxHistory.new_value))
            .filter(
                MaxHistory.athlete_id == athlete_id,
                MaxHistory.lift == lift,
                MaxHistory.exercise_name == canonical_name,
                MaxHistory.reps == 1,
            )
            .scalar()
        )
        if prior is not None and best_row.weight_lbs <= prior:
            continue
        db.add(
            MaxHistory(
                athlete_id=athlete_id,
                lift=lift,
                old_value=prior,
                new_value=best_row.weight_lbs,
                source=source,
                note=best_row.meet_name,
                recorded_at=_meet_date_to_datetime(best_row.meet_date),
                reps=1,
                exercise_name=canonical_name,
            )
        )
        written += 1
    return written


def log_max_changes(
    db: DBSession,
    athlete: Athlete,
    updates: dict,
    source: str = "manual",
    note: str | None = None,
) -> int:
    """Compare incoming updates against current athlete maxes and log any changes.

    Args:
        db: Database session.
        athlete: The athlete ORM object (with current values).
        updates: Dict of field names to new values.
        source: Where the change came from ("manual", "import", "resync").
        note: Optional note (e.g., program name that triggered the change).

    Returns:
        Number of max changes logged.
    """
    logged = 0

    for field, lift in MAX_FIELDS.items():
        if field not in updates:
            continue

        new_val = updates[field]
        if new_val is None:
            continue

        old_val = getattr(athlete, field, None)


        if old_val == new_val:
            continue

        entry = MaxHistory(
            athlete_id=athlete.id,
            lift=lift,
            old_value=old_val,
            new_value=new_val,
            source=source,
            note=note,
        )
        db.add(entry)
        logged += 1

    return logged
