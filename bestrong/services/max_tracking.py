"""Utility for tracking changes to athlete max lifts."""

from __future__ import annotations

from sqlalchemy.orm import Session as DBSession

from ..models.orm import Athlete, MaxHistory


MAX_FIELDS = {
    "squat_max_lbs": "squat",
    "bench_max_lbs": "bench",
    "deadlift_max_lbs": "deadlift",
    "total_lbs": "total",
}


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
