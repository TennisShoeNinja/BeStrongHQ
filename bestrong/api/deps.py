"""FastAPI dependencies — database session, auth helpers."""

from __future__ import annotations

import hashlib
import os
from collections.abc import Generator
from datetime import datetime

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from ..models.database import get_session_factory, init_db
from ..models.orm import AllowedUser, AuthSession


try:
    from bestrong_cloud import resolve_tenant_db as _plugin_resolver
    from bestrong_cloud import is_platform_admin as _plugin_is_admin
except ImportError:
    _plugin_resolver = None
    _plugin_is_admin = None


def get_db(request: Request) -> Generator[Session, None, None]:
    """Yield a database session, closing it when done.

    Resolves a per-request database when an optional resolver is wired in,
    otherwise falls back to the default single-instance database path.
    """
    cloud_mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip() == "cloud"
    if cloud_mode and _plugin_resolver is not None:
        db = _plugin_resolver(request)
        try:
            yield db
        finally:
            db.close()
        return


    init_db()
    factory = get_session_factory()
    db = factory()
    try:
        yield db
    finally:
        db.close()


_SESSION_COOKIE = "bestrong_session"


def require_admin(request: Request, db: Session) -> AllowedUser | None:
    """Verify the caller is an admin.  Raises 401/403 in hosted mode.

    In local mode (DEPLOYMENT_MODE != 'cloud') this is a no-op and
    returns None, because auth is not enforced.
    """
    mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()
    if mode != "cloud":
        return None

    token = request.cookies.get(_SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    session = (
        db.query(AuthSession)
        .filter(AuthSession.session_token == token_hash)
        .first()
    )
    if not session or session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired")

    allowed = (
        db.query(AllowedUser)
        .filter(AllowedUser.email == session.email)
        .first()
    )


    if not allowed or not allowed.is_admin:
        _is_platform_admin = bool(
            _plugin_is_admin and _plugin_is_admin(session.email)
        )
        if not _is_platform_admin:
            raise HTTPException(status_code=403, detail="Admin access required")

    return allowed
