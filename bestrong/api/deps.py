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
from ..plugins import get_hook


def _lazy_plugin_resolver():
    """Look up an optional per-request DB resolver at request time.

    Resolved lazily so optional integration startup order cannot permanently
    disable the resolver for the process.
    """
    return get_hook("db_resolver")


def _lazy_plugin_is_admin():
    """Look up an optional admin check at request time.

    Same lazy pattern as ``_lazy_plugin_resolver`` and for the same reason.
    """
    return get_hook("is_admin")


def get_db(request: Request) -> Generator[Session, None, None]:
    """Yield a database session, closing it when done.

    Resolves a per-request database when an optional resolver is wired
    in, otherwise falls back to the default single-instance database
    path. The single-instance path is what local installs use.
    """
    cloud_mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip() == "cloud"
    resolver = _lazy_plugin_resolver() if cloud_mode else None
    if resolver is not None:
        db = resolver(request)
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
    """Verify the caller is an admin. Raises 401/403 when auth is enabled.

    In the default local mode (DEPLOYMENT_MODE != 'cloud') this is a
    no-op and returns None, because auth is not enforced.
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
        plugin_is_admin = _lazy_plugin_is_admin()
        _is_platform_admin = bool(
            plugin_is_admin and plugin_is_admin(session.email)
        )
        if not _is_platform_admin:
            raise HTTPException(status_code=403, detail="Admin access required")

    return allowed
