"""Settings API routes — key/value store for coach profile, preferences, etc."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .deps import get_db, require_admin
from .security_logging import security_log
from ..models.orm import Setting

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    settings: dict[str, str | None]


class SettingsUpdate(BaseModel):
    settings: dict[str, str | None]


@router.get("", response_model=SettingsResponse)
async def get_settings(request: Request, db: Session = Depends(get_db)):
    """Return all settings as a flat dict. Admin only."""
    require_admin(request, db)
    rows = db.query(Setting).all()
    return SettingsResponse(settings={r.key: r.value for r in rows})


@router.put("", response_model=SettingsResponse)
async def update_settings(request: Request, body: SettingsUpdate, db: Session = Depends(get_db)):
    """Upsert one or more settings. Admin only."""
    require_admin(request, db)
    changed_keys = list(body.settings.keys())
    for key, value in body.settings.items():
        existing = db.query(Setting).filter(Setting.key == key).first()
        if existing:
            existing.value = value
        else:
            db.add(Setting(key=key, value=value))
    db.commit()

    security_log(
        "settings_changed",
        actor=getattr(request.state, "user_email", "anonymous"),
        request=request,
        detail=f"keys={','.join(changed_keys)}",
    )

    rows = db.query(Setting).all()
    return SettingsResponse(settings={r.key: r.value for r in rows})
