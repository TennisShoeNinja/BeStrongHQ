"""Per-instance feature toggles read from the settings KV table.

Settings are stored as strings; helpers here coerce them into typed
values. Defaults apply when a row is missing so existing instances don't
need a migration.
"""

from __future__ import annotations

from sqlalchemy.orm import Session


def _bool_setting(db: Session, key: str, default: bool) -> bool:
    from ..models.orm import Setting

    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None or row.value is None:
        return default
    return row.value.strip().lower() not in ("false", "0", "no", "off")


def tracks_rpe(db: Session) -> bool:
    """Whether this instance's coach logs actual RPE on completed sets."""
    return _bool_setting(db, "tracks_rpe", default=True)
