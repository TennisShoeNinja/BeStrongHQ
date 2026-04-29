"""FastAPI application factory."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app):

    from ..models.database import init_db
    init_db()


    deployment_mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()
    if deployment_mode == "cloud":

        missing = []
        bootstrap_email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip()
        if not bootstrap_email:
            missing.append("BOOTSTRAP_ADMIN_EMAIL")


        if missing:
            logger.critical(
                "DEPLOYMENT_MODE=cloud requires these env vars to be set: %s. "
                "Configure them in your .env file, then restart the application.",
                ", ".join(missing),
            )
            raise SystemExit(1)


        from sqlalchemy.exc import IntegrityError as _IntegrityError

        from ..models.database import get_session_factory
        from ..models.orm import AllowedUser

        try:
            from bestrong_cloud.registry import list_active_subdomains, lookup_tenant
            tenant_dbs = []
            for subdomain in list_active_subdomains():
                tenant = lookup_tenant(subdomain)
                if tenant is not None:
                    tenant_dbs.append(tenant.db_path)
        except Exception:
            tenant_dbs = [None]

        for tenant_db_path in tenant_dbs:
            factory = get_session_factory(tenant_db_path)
            db = factory()
            try:
                if db.query(AllowedUser).count() == 0:
                    admin = AllowedUser(
                        email=bootstrap_email.lower(),
                        name="Bootstrap Admin",
                        is_admin=True,
                    )
                    db.add(admin)
                    try:
                        db.commit()
                        logger.info(
                            "Hosted mode: seeded bootstrap admin (%s) for db=%s",
                            bootstrap_email,
                            tenant_db_path or "default",
                        )
                        from .security_logging import security_log
                        security_log(
                            "bootstrap_admin_created",
                            actor=bootstrap_email.lower(),
                            ip="server",
                            detail=f"seeded at startup (hosted mode, db={tenant_db_path or 'default'})",
                        )
                    except _IntegrityError:

                        db.rollback()
                        logger.info(
                            "Hosted mode: bootstrap admin already exists (concurrent insert)"
                        )
                else:
                    logger.info(
                        "Hosted mode: allowed users already exist, skipping bootstrap seed"
                    )
            finally:
                db.close()

    from ..gdrive.scheduler import start_scheduler
    try:
        start_scheduler()
    except Exception:
        logging.getLogger(__name__).warning("Failed to start gdrive scheduler", exc_info=True)

    yield


def _apply_stricter_limit(app, limiter, path: str, limit: str):
    """Apply a stricter rate limit to a specific path by wrapping its route."""

    for route in app.routes:
        if hasattr(route, "path") and route.path == path:

            original_endpoint = route.endpoint
            route.endpoint = limiter.limit(limit)(original_endpoint)
            break


def create_app():
    """Create and configure the FastAPI application."""

    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.errors import RateLimitExceeded
    from fastapi.responses import JSONResponse

    from .routes_analytics import router as analytics_router
    from .routes_athletes import router as athletes_router
    from .routes_auth import router as auth_router
    from .routes_calendar import router as calendar_router
    from .routes_exercise_aliases import router as exercise_aliases_router
    from .routes_gdrive import router as gdrive_router
    from .routes_meets import router as meets_router
    from .routes_meet_results import router as meet_results_router
    from .routes_programs import router as programs_router
    from .routes_notifications import router as notifications_router
    from .routes_search import router as search_router
    from .routes_sessions import router as sessions_router
    from .routes_settings import router as settings_router
    from .routes_wellness import router as wellness_router
    from .routes_worklog import router as worklog_router

    from .. import __version__

    app = FastAPI(
        title="BeStrong",
        description="Powerlifting coaching analytics API",
        version=__version__,
        lifespan=_lifespan,
    )


    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=["60/minute"],
    )
    app.state.limiter = limiter


    app.add_middleware(SlowAPIMiddleware)


    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request, exc):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Too many requests. Please try again later."},
        )


    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc):
        import logging as _logging
        _logging.getLogger("bestrong.security").warning(
            "unhandled_exception path=%s error=%s", request.url.path, type(exc).__name__
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )


    from .auth_middleware import AuthMiddleware
    app.add_middleware(AuthMiddleware)


    from .tenant_headers import TenantHeadersMiddleware
    app.add_middleware(TenantHeadersMiddleware)


    deployment_mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()
    if deployment_mode == "cloud":

        _env_origins = os.environ.get("ALLOWED_ORIGINS", "")
        _all_origins = [o.strip() for o in _env_origins.split(",") if o.strip()]
        if not _all_origins:
            logger.warning("CORS: No ALLOWED_ORIGINS set in hosted mode, cross-origin requests will be blocked")
    else:

        _default_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ]
        _env_origins = os.environ.get("ALLOWED_ORIGINS", "")
        _extra_origins = [o.strip() for o in _env_origins.split(",") if o.strip()] if _env_origins else []
        _all_origins = _default_origins + _extra_origins

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_all_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "version": __version__}

    app.include_router(auth_router)
    app.include_router(athletes_router)
    app.include_router(meets_router)
    app.include_router(meet_results_router)
    app.include_router(programs_router)
    app.include_router(sessions_router)
    app.include_router(analytics_router)
    app.include_router(gdrive_router)
    app.include_router(calendar_router)
    app.include_router(notifications_router)
    app.include_router(settings_router)
    app.include_router(wellness_router)
    app.include_router(worklog_router)
    app.include_router(exercise_aliases_router)
    app.include_router(search_router)


    try:
        from bestrong_cloud.api import router as _plugin_router
        app.include_router(_plugin_router)
    except ImportError:
        pass


    _apply_stricter_limit(app, limiter, "/api/auth/login", "5/minute")

    return app
