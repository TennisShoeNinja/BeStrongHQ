"""Google OAuth authentication routes."""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.orm import AllowedUser, AuthSession, OAuthState
from .deps import get_db, require_admin
from .security_logging import security_log


try:
    from bestrong_cloud import get_enabled_features as _plugin_features
    from bestrong_cloud import is_platform_admin as _plugin_is_admin
    from bestrong_cloud.registry import lookup_tenant as _plugin_lookup_tenant
except ImportError:
    _plugin_features = None
    _plugin_is_admin = None
    _plugin_lookup_tenant = None


try:
    from bestrong_cloud import post_deny_hook as _plugin_post_deny
except ImportError:
    _plugin_post_deny = None


router = APIRouter(prefix="/api/auth", tags=["auth"])


SESSION_DURATION_DAYS = 7


SESSION_COOKIE = "bestrong_session"


def _hash_token(raw_token: str) -> str:
    """SHA-256 hash a raw session token for storage/comparison.

    The raw token lives only in the cookie. The database stores this
    hash, so a database leak does not expose usable session tokens.
    """
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _get_google_client_id() -> str:
    """Read the login-purpose Google OAuth client ID."""
    from ..utils.oauth_config import get_oauth_client

    return get_oauth_client("login")[0]


def _get_google_client_secret() -> str:
    """Read the login-purpose Google OAuth client secret."""
    from ..utils.oauth_config import get_oauth_client

    return get_oauth_client("login")[1]


def _get_redirect_uri(request: Request) -> str:
    """Build the OAuth callback URI.

    Hosted mode: uses the Host header (preserved by Caddy) with https.
    The Host header is the standard HTTP header the browser sent, not
    a proxy-added header like X-Forwarded-*. Each instance's callback
    must be registered in Google Cloud Console.

    Local mode: uses explicit env var or derives from the request.
    """
    mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()

    if mode == "cloud":

        host = request.headers.get("host", "").split(":")[0]
        return f"https://{host}/api/auth/callback"


    override = os.environ.get("GOOGLE_REDIRECT_URI")
    if override:
        return override

    host = request.url.hostname or "localhost"
    port = request.url.port
    scheme = request.url.scheme
    base = f"{scheme}://{host}:{port}" if port else f"{scheme}://{host}"
    return f"{base}/api/auth/callback"


def _get_frontend_url(request: Request) -> str:
    """Get the frontend base URL for redirects after auth.

    Hosted mode: uses the Host header (preserved by Caddy) with https.
    Local mode: uses explicit env var or derives from the request.
    """
    mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()

    if mode == "cloud":
        host = request.headers.get("host", "").split(":")[0]
        return f"https://{host}"

    override = os.environ.get("FRONTEND_URL")
    if override:
        return override


    host = request.url.hostname or "localhost"
    port = request.url.port
    scheme = request.url.scheme

    if port == 8080:
        return f"{scheme}://{host}:3000"

    return f"{scheme}://{host}:{port}" if port else f"{scheme}://{host}"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    """Dependency: returns the current authenticated user or raises 401."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token_hash = _hash_token(token)
    session = (
        db.query(AuthSession)
        .filter(AuthSession.session_token == token_hash)
        .first()
    )

    if not session or session.expires_at < datetime.utcnow():
        if session:
            db.delete(session)
            db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    return session


def _deployment_mode() -> str:
    """Return the current deployment mode: 'local' or 'cloud'."""
    return os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()


def is_auth_enabled(db: Session) -> bool:
    """Check whether auth is enabled.

    In hosted mode, auth is ALWAYS enabled. The first admin is seeded
    at startup via BOOTSTRAP_ADMIN_EMAIL, so there is never an
    unprotected window.

    In local mode, auth is ALWAYS disabled. A local install is the
    coach's own machine; the database is the access boundary, not a
    login screen. The earlier behavior turned auth on as soon as any
    allowed_user row existed, which fired accidentally if the operator
    ever clicked "Sign in with Google" (the OAuth callback used to
    auto-create the first admin and flip the table from empty to
    non-empty), permanently locking the local install behind login.
    """
    if _deployment_mode() == "cloud":
        return True
    return False


class UserInfo(BaseModel):
    email: str
    name: str | None = None
    picture: str | None = None


class AllowedUserCreate(BaseModel):
    email: str
    name: str | None = None


class AllowedUserResponse(BaseModel):
    id: int
    email: str
    name: str | None
    is_admin: bool
    added_at: datetime

    model_config = {"from_attributes": True}


class TenantPublicInfo(BaseModel):
    """Non-sensitive instance metadata for the current request.

    Populated in hosted mode from the subdomain stamped on
    request.state by the optional resolver. db_path is intentionally
    excluded: it's host filesystem internals, not coach-facing info.
    """

    subdomain: str
    org_name: str
    parser_id: str


class TenantSettings(BaseModel):
    """Per-instance behavior toggles surfaced to the frontend.

    Read from the instance DB's ``settings`` key/value table at request
    time. Defaults apply when a row is missing, so new instances get the
    expected behavior without an explicit migration.
    """

    tracks_rpe: bool = True


class AuthStatusResponse(BaseModel):
    authenticated: bool
    auth_enabled: bool
    deployment_mode: str = "local"
    user: UserInfo | None = None
    tenant: TenantPublicInfo | None = None
    tenant_settings: TenantSettings = TenantSettings()
    features: list[str] = []


def _resolve_tenant_settings(db: Session) -> TenantSettings:
    """Surface per-instance behavior toggles for the frontend."""
    from ..utils.feature_flags import tracks_rpe

    return TenantSettings(tracks_rpe=tracks_rpe(db))


def _resolve_tenant_info(request: Request) -> TenantPublicInfo | None:
    """Look up the current request's instance from the control-plane registry.

    Returns None in local mode or when the optional resolver isn't wired in.
    The subdomain was stamped on request.state by the resolver running
    inside the get_db dependency.
    """
    if _deployment_mode() != "cloud":
        return None

    subdomain = getattr(request.state, "tenant_subdomain", None)
    if not subdomain:
        return None

    if _plugin_lookup_tenant is None:
        return None

    tenant = _plugin_lookup_tenant(subdomain)
    if tenant is None:
        return None

    return TenantPublicInfo(
        subdomain=tenant.subdomain,
        org_name=tenant.org_name,
        parser_id=tenant.parser_id,
    )


def _resolve_features(
    request: Request, user_email: str | None = None
) -> list[str]:
    """Return optional feature flags for the current instance.

    Defers entirely to the optional plugin's resolver when present.
    Returns an empty list when no plugin is installed.
    """
    if _plugin_features is None:
        return []
    result = _plugin_features(request, user_email=user_email)
    return result if result is not None else []


@router.get("/branding")
def get_branding(db: Session = Depends(get_db)):
    """Public endpoint: returns branding info used by the login page.

    No auth required — this is intentionally public so the login page
    can show the correct team name before the user has authenticated.
    """
    from ..models.orm import Setting

    row = db.query(Setting).filter(Setting.key == "team_name").first()
    team_name = row.value if row and row.value else "BeStrong"
    return {"team_name": team_name}


@router.get("/status", response_model=AuthStatusResponse)
def auth_status(request: Request, db: Session = Depends(get_db)):
    """Check if the user is authenticated and if auth is enabled."""
    enabled = is_auth_enabled(db)
    mode = _deployment_mode()
    tenant = _resolve_tenant_info(request)
    tenant_settings = _resolve_tenant_settings(db)
    features = _resolve_features(request)

    if not enabled:

        return AuthStatusResponse(
            authenticated=True,
            auth_enabled=False,
            deployment_mode=mode,
            tenant=tenant,
            tenant_settings=tenant_settings,
            features=features,
        )

    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return AuthStatusResponse(
            authenticated=False,
            auth_enabled=True,
            deployment_mode=mode,
            tenant=tenant,
            tenant_settings=tenant_settings,
            features=features,
        )

    token_hash = _hash_token(token)
    session = (
        db.query(AuthSession)
        .filter(AuthSession.session_token == token_hash)
        .first()
    )

    if not session or session.expires_at < datetime.utcnow():
        return AuthStatusResponse(
            authenticated=False,
            auth_enabled=True,
            deployment_mode=mode,
            tenant=tenant,
            tenant_settings=tenant_settings,
            features=features,
        )


    features = _resolve_features(request, user_email=session.email)

    return AuthStatusResponse(
        authenticated=True,
        auth_enabled=True,
        deployment_mode=mode,
        user=UserInfo(
            email=session.email,
            name=session.name,
            picture=session.picture,
        ),
        tenant=tenant,
        tenant_settings=tenant_settings,
        features=features,
    )


@router.get("/login")
def login(request: Request, db: Session = Depends(get_db)):
    """Redirect to Google OAuth consent screen.

    Rate limited to 60/minute by default (can be customized per-endpoint if needed).
    """
    client_id = _get_google_client_id()
    if not client_id:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth not configured. Upload credentials.json via the Integrations page first.",
        )

    redirect_uri = _get_redirect_uri(request)
    state = secrets.token_urlsafe(32)


    oauth_state = OAuthState(
        state=state,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(oauth_state)


    now = datetime.utcnow()
    db.query(OAuthState).filter(OAuthState.expires_at < now).delete(
        synchronize_session="fetch"
    )
    db.commit()


    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    return RedirectResponse(url=google_auth_url)


@router.get("/callback")
def callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    """Handle Google OAuth callback."""
    import requests as http_requests

    frontend_url = _get_frontend_url(request)

    if error:
        return RedirectResponse(url=f"{frontend_url}/login?error={error}")


    oauth_state = (
        db.query(OAuthState).filter(OAuthState.state == state).first()
    )
    if not oauth_state:
        return RedirectResponse(url=f"{frontend_url}/login?error=invalid_state")
    if oauth_state.expires_at < datetime.utcnow():
        db.delete(oauth_state)
        db.commit()
        return RedirectResponse(url=f"{frontend_url}/login?error=state_expired")

    db.delete(oauth_state)
    db.commit()

    if not code:
        return RedirectResponse(url=f"{frontend_url}/login?error=no_code")


    client_id = _get_google_client_id()
    client_secret = _get_google_client_secret()
    redirect_uri = _get_redirect_uri(request)

    token_resp = http_requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )

    if token_resp.status_code != 200:
        return RedirectResponse(url=f"{frontend_url}/login?error=token_exchange_failed")

    tokens = token_resp.json()
    access_token = tokens.get("access_token")


    userinfo_resp = http_requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )

    if userinfo_resp.status_code != 200:
        return RedirectResponse(url=f"{frontend_url}/login?error=userinfo_failed")

    userinfo = userinfo_resp.json()
    email = userinfo.get("email", "").lower().strip()
    name = userinfo.get("name")
    picture = userinfo.get("picture")

    if not email:
        return RedirectResponse(url=f"{frontend_url}/login?error=no_email")


    allowed = (
        db.query(AllowedUser)
        .filter(AllowedUser.email == email)
        .first()
    )


    _is_platform_admin = bool(_plugin_is_admin and _plugin_is_admin(email))

    if not allowed:
        if _is_platform_admin:


            pass
        elif _deployment_mode() == "local" and db.query(AllowedUser).count() == 0:


            try:
                allowed = AllowedUser(email=email, name=name, is_admin=True)
                db.add(allowed)
                db.flush()
                security_log(
                    "first_admin_created",
                    actor=email,
                    request=request,
                    detail="auto-created via OAuth callback (local mode)",
                )
            except IntegrityError:
                db.rollback()
                allowed = (
                    db.query(AllowedUser)
                    .filter(AllowedUser.email == email)
                    .first()
                )
                if not allowed:
                    return RedirectResponse(
                        url=f"{frontend_url}/login?error=not_allowed"
                    )
        else:

            if _plugin_post_deny is not None:
                fallback = _plugin_post_deny(
                    db, email=email, request=request, frontend_url=frontend_url
                )
                if fallback is not None:
                    return fallback

            import logging as _logging

            security_log(
                "login_denied",
                actor=email,
                request=request,
                detail="email not on allowlist",
                level=_logging.WARNING,
            )
            return RedirectResponse(
                url=f"{frontend_url}/login?error=not_allowed"
            )


    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(days=SESSION_DURATION_DAYS)

    auth_session = AuthSession(
        session_token=token_hash,
        email=email,
        name=name,
        picture=picture,
        expires_at=expires_at,
    )
    db.add(auth_session)
    db.commit()


    subdomain = getattr(request.state, "tenant_subdomain", None)
    if _is_platform_admin and subdomain:
        security_log(
            "login_success",
            actor=email,
            request=request,
            detail=f"platform_admin tenant={subdomain}",
        )
    else:
        security_log("login_success", actor=email, request=request)


    is_cloud = _deployment_mode() == "cloud"
    response = RedirectResponse(url=frontend_url, status_code=302)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=raw_token,
        httponly=True,
        secure=is_cloud,
        samesite="lax",
        max_age=SESSION_DURATION_DAYS * 24 * 60 * 60,
        path="/",
    )
    return response


@router.get("/me", response_model=UserInfo)
def get_me(user: AuthSession = Depends(get_current_user)):
    """Get the current authenticated user's info."""
    return UserInfo(email=user.email, name=user.name, picture=user.picture)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Log out by clearing the session cookie and deleting the session."""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        token_hash = _hash_token(token)
        session = (
            db.query(AuthSession)
            .filter(AuthSession.session_token == token_hash)
            .first()
        )
        if session:
            security_log("logout", actor=session.email, request=request)
            db.delete(session)
            db.commit()

    response = RedirectResponse(url="/login", status_code=302)
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return response


def _require_admin(request: Request, db: Session) -> AllowedUser | None:
    """Local wrapper — delegates to the shared require_admin in deps.py."""
    return require_admin(request, db)


@router.get("/allowed-users", response_model=list[AllowedUserResponse])
def list_allowed_users(request: Request, db: Session = Depends(get_db)):
    """List all allowed users. Admin only in hosted mode."""
    if _deployment_mode() == "cloud":
        _require_admin(request, db)
    return db.query(AllowedUser).order_by(AllowedUser.email).all()


@router.post("/allowed-users", response_model=AllowedUserResponse)
def add_allowed_user(
    data: AllowedUserCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Add a new allowed user email. Admin only.

    In hosted mode, admin auth is always required (the first admin is
    seeded at startup). In local mode, the first user added when the
    list is empty automatically becomes admin without auth.
    """
    email = data.email.lower().strip()

    existing_count = db.query(AllowedUser).count()

    if _deployment_mode() == "cloud":

        _require_admin(request, db)
    elif existing_count > 0:

        _require_admin(request, db)

    existing = db.query(AllowedUser).filter(AllowedUser.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already in allowed list")


    is_first_user = existing_count == 0
    user = AllowedUser(email=email, name=data.name, is_admin=is_first_user)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:

        db.rollback()
        raise HTTPException(status_code=409, detail="Email already in allowed list")
    db.refresh(user)

    security_log(
        "user_added",
        actor=getattr(request.state, "user_email", "anonymous"),
        request=request,
        detail=f"added={email} is_admin={is_first_user}",
    )
    return user


@router.delete("/allowed-users/{user_id}")
def remove_allowed_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Remove an email from the allowed users list. Admin only."""
    _require_admin(request, db)

    user = db.query(AllowedUser).filter(AllowedUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")


    if user.is_admin and _deployment_mode() == "cloud":
        admin_count = db.query(AllowedUser).filter(AllowedUser.is_admin == True).count()  # noqa: E712
        if admin_count <= 1:
            requester_email = getattr(request.state, "user_email", None)
            requester_is_platform_admin = bool(
                _plugin_is_admin and requester_email and _plugin_is_admin(requester_email)
            )
            if not requester_is_platform_admin:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove the only admin. Promote another user first.",
                )


    revoked_count = (
        db.query(AuthSession)
        .filter(AuthSession.email == user.email)
        .delete(synchronize_session="fetch")
    )

    removed_email = user.email
    db.delete(user)
    db.commit()

    security_log(
        "user_removed",
        actor=getattr(request.state, "user_email", "anonymous"),
        request=request,
        detail=f"removed={removed_email} sessions_revoked={revoked_count}",
    )
    return {"status": "ok", "removed": removed_email, "sessions_revoked": revoked_count}
