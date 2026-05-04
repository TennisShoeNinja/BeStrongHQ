"""Authentication middleware for FastAPI.

In the default local mode the middleware is bypassed entirely (the app
is only reachable on localhost, so auth adds no value). Setting
DEPLOYMENT_MODE to anything else enforces a session cookie on every
/api/ route except the explicitly exempted auth/health endpoints.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from ..models.database import get_session_factory
from ..models.orm import AllowedUser, AuthSession
from .security_logging import security_log


def _deployment_mode() -> str:
    """Return the current deployment mode: 'local' or 'cloud'."""
    return os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()


AUTH_EXEMPT_PATHS: tuple[str, ...] = (
    "/api/auth/branding",
    "/api/auth/status",
    "/api/auth/login",
    "/api/auth/callback",
    "/api/auth/logout",
    "/api/health",
    "/api/gdrive/auth/callback",
)


def _lazy_plugin_resolver():
    """Look up the optional tenant resolver at request time.

    Mirrors the pattern in ``deps.py``. An eager top-level import would
    fail silently if the cloud plugin is mid-initialization when this
    module loads, permanently disabling tenant resolution for the process.
    """
    try:
        from bestrong_cloud import resolve_tenant_db
        return resolve_tenant_db
    except ImportError:
        return None


def _lazy_plugin_is_admin():
    """Look up the optional platform-admin check at request time."""
    try:
        from bestrong_cloud import is_platform_admin
        return is_platform_admin
    except ImportError:
        return None


def _exempt_paths() -> tuple[str, ...]:
    """Return the auth-exempt path tuple, including any cloud-side additions."""
    try:
        from bestrong_cloud.api import AUTH_EXEMPT_PATHS as _plugin_exempt
        return AUTH_EXEMPT_PATHS + _plugin_exempt
    except (ImportError, AttributeError):
        return AUTH_EXEMPT_PATHS


class AuthMiddleware(BaseHTTPMiddleware):
    """Check session cookie on all /api/ routes when auth is enabled."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path


        if not path.startswith("/api/"):
            return await call_next(request)


        if _deployment_mode() == "local":
            return await call_next(request)


        for exempt in _exempt_paths():
            if path == exempt or path.startswith(exempt + "/"):
                return await call_next(request)


        plugin_resolver = _lazy_plugin_resolver()
        if plugin_resolver is not None:
            try:
                db = plugin_resolver(request)
            except Exception:
                security_log(
                    "auth_error",
                    request=request,
                    detail=f"instance resolution failed path={path}",
                    level=logging.WARNING,
                )
                return JSONResponse(
                    status_code=500,
                    content={"detail": "Could not resolve instance"},
                )
        else:
            factory = get_session_factory()
            db = factory()
        try:
            from .routes_auth import SESSION_COOKIE, _hash_token

            token = request.cookies.get(SESSION_COOKIE)
            if not token:
                security_log(
                    "auth_denied",
                    request=request,
                    detail=f"no session cookie path={path}",
                    level=logging.WARNING,
                )
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Not authenticated"},
                )

            token_hash = _hash_token(token)
            session = (
                db.query(AuthSession)
                .filter(AuthSession.session_token == token_hash)
                .first()
            )

            if not session or session.expires_at < datetime.utcnow():
                if session:
                    security_log(
                        "session_expired",
                        actor=session.email,
                        request=request,
                        detail=f"path={path}",
                        level=logging.WARNING,
                    )
                    db.delete(session)
                    db.commit()
                else:
                    security_log(
                        "auth_denied",
                        request=request,
                        detail=f"invalid session token path={path}",
                        level=logging.WARNING,
                    )
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Session expired"},
                )


            allowed = (
                db.query(AllowedUser)
                .filter(AllowedUser.email == session.email)
                .first()
            )
            if not allowed:

                plugin_is_admin = _lazy_plugin_is_admin()
                _is_platform_admin = bool(
                    plugin_is_admin and plugin_is_admin(session.email)
                )

                if not _is_platform_admin:
                    security_log(
                        "access_revoked",
                        actor=session.email,
                        request=request,
                        detail=f"user no longer on allowlist path={path}",
                        level=logging.WARNING,
                    )
                    db.delete(session)
                    db.commit()
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "User access revoked"},
                    )


            request.state.user_email = session.email
            request.state.user_name = session.name

        except Exception:
            security_log(
                "auth_error",
                request=request,
                detail=f"unhandled exception during auth check path={path}",
                level=logging.WARNING,
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
            )
        finally:
            db.close()

        return await call_next(request)
