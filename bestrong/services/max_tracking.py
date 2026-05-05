"""Utility for tracking changes to athlete max lifts."""

from __future__ import annotations

from sqlalchemy import func
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

# MaxHistory.source values whose new_value should NOT contribute as a
# non-meet floor when reconciling. Meet-derived rows can disappear with
# their backing MeetResult; we want the recompute to fall back to other
# evidence (training PRs, declared baselines) instead of using the
# stale meet-derived MaxHistory entry as a floor.
_MEET_DERIVED_HISTORY_SOURCES = frozenset({"meet", "opl", "opl_resync"})


def recompute_canonical_max(db: DBSession, athlete: Athlete, lift: str) -> float | None:
    """Compute what ``athlete.<lift>_max_lbs`` should be from current evidence.

    Pieces of evidence:

    * The heaviest made attempt across all current MeetResult rows
      (any source — OPL, manual coach entry).
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
    best_meet = (
        db.query(func.max(MeetResult.weight_lbs))
        .filter(
            MeetResult.athlete_id == athlete.id,
            MeetResult.lift == lift,
            MeetResult.made.is_(True),
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
