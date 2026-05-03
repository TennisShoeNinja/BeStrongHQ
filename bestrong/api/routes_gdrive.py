"""Google Drive integration endpoints — auth status, folder config, sync."""

from __future__ import annotations

import json
import logging
import os
import queue
import secrets
import tempfile
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests as http_requests
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..gdrive import client, sync
from ..gdrive.scheduler import get_scheduler
from ..models.orm import Program, GDriveImport, Setting, OAuthState
from ..models.database import get_session
from ..api.deps import get_db, require_admin
from ..services import import_file
from .error_helpers import safe_error
from .security_logging import security_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gdrive", tags=["gdrive"])


def _session_db_path(db: Session) -> Path | None:
    """Best-effort extraction of the current session's SQLite file path."""
    bind = db.get_bind()
    url = getattr(bind, "url", None)
    database = getattr(url, "database", None)
    return Path(database) if database else None


def _validate_folder_id(db: Session, submitted_folder_id: str | None) -> None:
    """Validate that a caller-submitted folder ID matches the configured integration target.

    This prevents attackers from retargeting the server's OAuth credentials to arbitrary folders.
    Only enforced for OPERATION endpoints (list, sync). Configuration endpoints are exempt.

    Raises HTTPException with 403 if the submitted ID doesn't match configured settings.
    """
    if not submitted_folder_id:
        return


    configured_folder = db.query(Setting).filter(Setting.key == "gdrive_folder_id").first()
    if configured_folder and configured_folder.value:
        if submitted_folder_id != configured_folder.value:
            raise HTTPException(
                status_code=403,
                detail="Submitted folder ID does not match configured integration target"
            )
        return


    watched_folders = db.query(Setting).filter(Setting.key == "gdrive_watched_folders").first()
    if watched_folders and watched_folders.value:
        import json
        try:
            folders = json.loads(watched_folders.value)
            folder_ids = [f.get("id") for f in folders if isinstance(f, dict)]
            if submitted_folder_id not in folder_ids:
                raise HTTPException(
                    status_code=403,
                    detail="Submitted folder ID does not match any configured watched folders"
                )
            return
        except json.JSONDecodeError:
            pass


    raise HTTPException(
        status_code=400,
        detail="No folders configured. Cannot accept folder_id parameter."
    )


_resync_lock = threading.Lock()
_resync_status_by_db: dict[str, dict] = {}


def _resync_key(db_path: Path | None) -> str:
    return str(db_path) if db_path is not None else "default"


def _get_resync_status(db_path: Path | None) -> dict:
    key = _resync_key(db_path)
    with _resync_lock:
        if key not in _resync_status_by_db:
            _resync_status_by_db[key] = {
                "running": False,
                "phase": "idle",
                "total": 0,
                "resynced": 0,
                "errors": [],
                "started_at": None,
                "finished_at": None,
            }
        return _resync_status_by_db[key]


class AuthStatus(BaseModel):
    has_credentials: bool
    is_authenticated: bool


    connection_status: str = "disconnected"
    connected_email: str | None = None
    last_error: str | None = None
    last_error_at: str | None = None
    last_successful_sync_at: str | None = None


    refresh_token_issued_at: str | None = None
    refresh_token_expires_at: str | None = None


class FolderInfo(BaseModel):
    id: str
    name: str
    modifiedTime: str | None = None


class SheetInfo(BaseModel):
    id: str
    name: str
    modifiedTime: str | None = None
    createdTime: str | None = None


class SetFolderRequest(BaseModel):
    folder_id: str


class WatchedFolderEntry(BaseModel):
    id: str
    name: str


class SetWatchedFoldersRequest(BaseModel):
    folders: list[WatchedFolderEntry]


class ExcludedFoldersRequest(BaseModel):
    folders: list[str]


class SyncResponse(BaseModel):
    total_found: int
    total_imported: int
    total_skipped: int
    total_errors: int
    imported: list[dict]
    skipped: list[dict]
    errors: list[dict]
    folders_scanned: list[str] = []
    folders_excluded: list[str] = []


class ResyncResponse(BaseModel):
    status: str
    program_id: int
    sessions_imported: int
    exercises_imported: int


class ResyncAllResponse(BaseModel):
    status: str
    total: int
    resynced: int
    errors: list[str]


def _get_frontend_url(request: Request) -> str:
    """Get the frontend base URL for redirects after GDrive auth.

    Hosted mode: uses the Host header so each instance stays on their
    subdomain through the OAuth round-trip.

    Local mode: uses FRONTEND_URL override or derives from the request.
    Never trusts X-Forwarded-* headers.
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


@router.get("/auth/status", response_model=AuthStatus)
def get_auth_status(request: Request, db: Session = Depends(get_db)):
    """Check if Google Drive is configured and authenticated.

    Exercises the refresh path so a stale token gets flagged "expired"
    as soon as the UI asks, rather than waiting for the next scheduler
    run.
    """
    require_admin(request, db)
    is_auth = client.is_authenticated(db=db)
    health = client.get_connection_health(db=db)
    return AuthStatus(
        has_credentials=client.has_credentials_file(),
        is_authenticated=is_auth,
        connection_status=health["status"],
        connected_email=health["email"],
        last_error=health["last_error"],
        last_error_at=health["last_error_at"],
        last_successful_sync_at=health["last_successful_sync_at"],
        refresh_token_issued_at=health["refresh_token_issued_at"],
        refresh_token_expires_at=health["refresh_token_expires_at"],
    )


@router.get("/auth/start")
def start_gdrive_auth(request: Request, db: Session = Depends(get_db)):
    """Return the Google OAuth consent URL for Drive access.

    Returns JSON with the auth_url so the frontend can fetch this
    through the Next.js proxy and then redirect the browser to Google.
    This avoids requiring NEXT_PUBLIC_API_URL for local development.

    Uses the same Web Application OAuth client as login, but requests
    drive.readonly scope instead of profile scopes. CSRF state is stored
    in the database (reuses the OAuthState table from login auth).
    """
    require_admin(request, db)

    client_id = client._get_google_client_id()
    if not client_id:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
        )

    redirect_uri = client._get_gdrive_redirect_uri(request)
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
        "scope": " ".join(client.SCOPES),
        "access_type": "offline",
        "state": state,
        "prompt": "consent",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    return {"auth_url": google_auth_url}


@router.get("/auth/callback")
def gdrive_auth_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    """Handle Google OAuth callback for Drive authorization.

    Validates CSRF state, exchanges the authorization code for tokens,
    fetches the user's email, and stores everything in the database.
    Redirects back to the GDrive settings page when done.
    """
    frontend_url = _get_frontend_url(request)
    settings_url = f"{frontend_url}/integrations/google-drive"

    if error:
        security_log(
            "gdrive_auth_denied",
            actor="unknown",
            request=request,
            detail=f"oauth_error={error}",
        )
        return RedirectResponse(url=f"{settings_url}?error={error}")


    oauth_state = (
        db.query(OAuthState).filter(OAuthState.state == state).first()
    )
    if not oauth_state:
        return RedirectResponse(url=f"{settings_url}?error=invalid_state")
    if oauth_state.expires_at < datetime.utcnow():
        db.delete(oauth_state)
        db.commit()
        return RedirectResponse(url=f"{settings_url}?error=state_expired")

    db.delete(oauth_state)
    db.commit()

    if not code:
        return RedirectResponse(url=f"{settings_url}?error=no_code")


    redirect_uri = client._get_gdrive_redirect_uri(request)
    token_resp = http_requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client._get_google_client_id(),
            "client_secret": client._get_google_client_secret(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )

    if token_resp.status_code != 200:
        return RedirectResponse(url=f"{settings_url}?error=token_exchange_failed")

    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")

    if not access_token or not refresh_token:
        return RedirectResponse(url=f"{settings_url}?error=missing_tokens")


    expires_in = tokens.get("expires_in")
    expiry = None
    if expires_in:
        expiry = datetime.utcnow() + timedelta(seconds=int(expires_in))


    userinfo_resp = http_requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )

    if userinfo_resp.status_code != 200:
        return RedirectResponse(url=f"{settings_url}?error=userinfo_failed")

    email = userinfo_resp.json().get("email", "").lower().strip()
    if not email:
        return RedirectResponse(url=f"{settings_url}?error=no_email")


    client.save_tokens(
        access_token=access_token,
        refresh_token=refresh_token,
        expiry=expiry,
        email=email,
        db=db,
    )


    try:
        from ..gcal import client as gcal_client
        gcal_client.save_tokens_from_oauth_response(
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_in": int(expires_in) if expires_in else None,
                "scope": tokens.get("scope", ""),
            },
            db=db,
        )


        try:
            gcal_client.ensure_bestronghq_calendar(db=db)
        except Exception as cal_err:  # noqa: BLE001
            logger.warning(
                "BeStrongHQ provisioning during Drive auth failed: %s", cal_err
            )
    except Exception as gcal_err:  # noqa: BLE001
        logger.warning(
            "Calendar token mirror during Drive auth failed: %s", gcal_err
        )

    security_log(
        "gdrive_auth_success",
        actor=email,
        request=request,
        detail="gdrive+gcal tokens stored",
    )

    return RedirectResponse(url=settings_url, status_code=302)


@router.post("/auth/disconnect")
def disconnect_gdrive(request: Request, db: Session = Depends(get_db)):
    """Disconnect the coach's Google account.

    Clears Drive tokens AND the mirrored calendar token, since they're
    granted as one consent. The coach reconnects via this same Drive
    page to restore both.
    """
    require_admin(request, db)
    email = client.get_connected_email(db=db) or "unknown"
    client.disconnect(db=db)


    try:
        from ..gcal import client as gcal_client
        gcal_client.disconnect(db=db)
    except Exception as gcal_err:  # noqa: BLE001
        logger.warning(
            "Calendar token clear during Drive disconnect failed: %s", gcal_err
        )

    security_log(
        "gdrive_disconnected",
        actor=email,
        request=request,
    )
    return {"status": "ok", "message": "Google account disconnected."}


@router.get("/folders", response_model=list[FolderInfo])
def list_folders(request: Request, parent_id: str = "root", db: Session = Depends(get_db)):
    """List folders in Google Drive (for folder picker)."""
    require_admin(request, db)
    try:
        folders = client.list_folders(parent_id, db=db)
        return [FolderInfo(**f) for f in folders]
    except RuntimeError as e:
        safe_error(e, "Failed to list Google Drive folders", status_code=401)


@router.get("/folder-sheet-count")
def count_sheets_in_folder(request: Request, folder_id: str = "root", db: Session = Depends(get_db)):
    """Count Google Sheets directly inside a folder (picker preview only).

    Used by the folder picker to show "My Drive root (N sheets)" before the
    coach commits. No _validate_folder_id check — this is a read-only probe
    of the coach's own Drive during configuration, consistent with /folders.
    """
    require_admin(request, db)
    try:
        sheets = client.list_sheets_in_folder(folder_id, db=db)
        return {"count": len(sheets)}
    except RuntimeError as e:
        safe_error(e, "Failed to count Google Drive sheets", status_code=401)


@router.get("/folder", response_model=FolderInfo | None)
def get_watched_folder(request: Request, db: Session = Depends(get_db)):
    """Get the currently configured watched folder."""
    require_admin(request, db)
    folder_id = client.get_watched_folder_id(db=db)
    if not folder_id:
        return None
    try:
        meta = client.get_file_metadata(folder_id, db=db)
        return FolderInfo(id=meta["id"], name=meta["name"], modifiedTime=meta.get("modifiedTime"))
    except Exception:
        return FolderInfo(id=folder_id, name="(unknown)")


@router.post("/folder")
def set_watched_folder(request: Request, req: SetFolderRequest, db: Session = Depends(get_db)):
    """Set the folder to watch for new training programs."""
    require_admin(request, db)
    client.set_watched_folder_id(req.folder_id, db=db)
    return {"status": "ok", "folder_id": req.folder_id}


@router.get("/watched-folders", response_model=list[WatchedFolderEntry])
def get_watched_folders(request: Request, db: Session = Depends(get_db)):
    """Get the list of individually watched folders."""
    require_admin(request, db)
    folders = client.get_watched_folders(db=db)
    return [WatchedFolderEntry(**f) for f in folders]


@router.post("/watched-folders", response_model=list[WatchedFolderEntry])
def set_watched_folders(request: Request, req: SetWatchedFoldersRequest, db: Session = Depends(get_db)):
    """Set the list of individually watched folders."""
    require_admin(request, db)
    try:
        client.set_watched_folders([f.model_dump() for f in req.folders], db=db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return req.folders


@router.get("/excluded-folders")
def get_excluded_folders(request: Request, db: Session = Depends(get_db)):
    """Get list of excluded folder names."""
    require_admin(request, db)
    return {"folders": client.get_excluded_folders(db=db)}


@router.post("/excluded-folders")
def set_excluded_folders(request: Request, req: ExcludedFoldersRequest, db: Session = Depends(get_db)):
    """Set list of folder names to skip during sync."""
    require_admin(request, db)
    client.set_excluded_folders(req.folders, db=db)
    return {"status": "ok", "folders": req.folders}


@router.get("/sheets", response_model=list[SheetInfo])
def list_sheets(request: Request, folder_id: str | None = None, db: Session = Depends(get_db)):
    """List Google Sheets in the watched folder (or a specific folder).

    If folder_id is provided, it must match a configured watched folder.
    """
    require_admin(request, db)
    _validate_folder_id(db, folder_id)
    fid = folder_id or client.get_watched_folder_id(db=db)
    if not fid:
        raise HTTPException(status_code=400, detail="No folder configured.")
    try:
        sheets = client.list_sheets_in_folder(fid, db=db)
        return [SheetInfo(**s) for s in sheets]
    except RuntimeError as e:
        safe_error(e, "Failed to list Google Drive sheets", status_code=401)


@router.post("/sync", response_model=SyncResponse)
def trigger_sync(
    request: Request,
    folder_id: str | None = None,
    force: bool = False,
    db: Session = Depends(get_db),
):
    """Scan the watched folder and import any new/updated Google Sheets.

    If folder_id is provided, it must match a configured watched folder.

    Pass ``force=true`` to re-import every program file regardless of
    Drive's modifiedTime — escape hatch for cases where content changed
    but modifiedTime didn't bump.
    """
    require_admin(request, db)
    _validate_folder_id(db, folder_id)
    try:
        result = sync.sync_folder(folder_id=folder_id, db=db, force=force)
        client.mark_sync_success(db=db)
        return SyncResponse(**result.to_dict())
    except ValueError as e:
        safe_error(e, "Invalid sync parameters", status_code=400)
    except RuntimeError as e:
        client.mark_sync_auth_failure(str(e), db=db)
        safe_error(e, "Failed to sync Google Drive", status_code=401)
    except Exception as e:
        import traceback
        import logging
        logging.getLogger(__name__).error("Sync failed: %s\n%s", e, traceback.format_exc())
        safe_error(e, "Failed to sync Google Drive files", status_code=500)


@router.get("/history")
def get_import_history(request: Request, db: Session = Depends(get_db)):
    """Get history of all Google Drive imports."""
    require_admin(request, db)
    return sync.get_import_history(db=db)


@router.post("/resync/{program_id}", response_model=ResyncResponse)
def resync_program(request: Request, program_id: int, db: Session = Depends(get_db)):
    """Resync a single program from Google Drive."""
    require_admin(request, db)
    try:

        program = db.query(Program).filter(Program.id == program_id).first()
        if not program:
            raise HTTPException(status_code=404, detail=f"Program {program_id} not found")


        gdrive_import = db.query(GDriveImport).filter(
            GDriveImport.program_id == program_id
        ).first()
        if not gdrive_import:
            raise HTTPException(
                status_code=404,
                detail="No Google Drive source found for this program"
            )


        athlete = program.athlete


        gdrive_file_id = gdrive_import.gdrive_file_id
        file_name = gdrive_import.gdrive_file_name

        import os

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            xlsx_bytes = client.export_sheet_as_xlsx(gdrive_file_id, db=db)
            tmp.write(xlsx_bytes)
            tmp.flush()
            tmp_path = tmp.name

        try:


            result = import_file(
                path=tmp_path,
                db=db,
                title=file_name,
                athlete_name=athlete.name if athlete else None,
                existing_program_id=program_id,
            )

            sessions_imported = result.get("sessions_imported", 0)
            exercises_imported = result.get("exercises_imported", 0)


            meta = client.get_file_metadata(gdrive_file_id, db=db)
            gdrive_import.gdrive_modified_time = meta.get("modifiedTime", gdrive_import.gdrive_modified_time)
            db.commit()

            return ResyncResponse(
                status="ok",
                program_id=result.get("program_id", program_id),
                sessions_imported=sessions_imported,
                exercises_imported=exercises_imported,
            )
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        import logging
        logging.getLogger(__name__).error("Resync failed: %s\n%s", e, traceback.format_exc())
        safe_error(e, "Failed to resync program from Google Drive", status_code=500)


@router.post("/resync-all/{athlete_id}", response_model=ResyncAllResponse)
def resync_all_programs(request: Request, athlete_id: int, db: Session = Depends(get_db)):
    """Resync all programs for an athlete from Google Drive."""
    require_admin(request, db)
    try:
        import os


        gdrive_imports = db.query(GDriveImport).join(
            Program, GDriveImport.program_id == Program.id
        ).filter(Program.athlete_id == athlete_id).all()

        total = len(gdrive_imports)
        resynced = 0
        errors = []

        for gdrive_import in gdrive_imports:
            try:
                program = gdrive_import.program
                if not program:
                    errors.append(f"Program {gdrive_import.program_id} not found")
                    continue

                athlete = program.athlete


                gdrive_file_id = gdrive_import.gdrive_file_id
                file_name = gdrive_import.gdrive_file_name

                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    xlsx_bytes = client.export_sheet_as_xlsx(gdrive_file_id, db=db)
                    tmp.write(xlsx_bytes)
                    tmp.flush()
                    tmp_path = tmp.name

                try:


                    import_file(
                        path=tmp_path,
                        db=db,
                        title=file_name,
                        athlete_name=athlete.name if athlete else None,
                        existing_program_id=gdrive_import.program_id,
                    )


                    meta = client.get_file_metadata(gdrive_file_id, db=db)
                    gdrive_import.gdrive_modified_time = meta.get("modifiedTime", gdrive_import.gdrive_modified_time)
                    db.commit()

                    resynced += 1

                finally:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)

            except Exception as e:
                import traceback
                import logging
                logging.getLogger(__name__).error("Resync failed for program %s: %s\n%s", gdrive_import.program_id, e, traceback.format_exc())
                errors.append(f"Program {gdrive_import.program_id}: {str(e)}")

        return ResyncAllResponse(
            status="ok",
            total=total,
            resynced=resynced,
            errors=errors,
        )

    except Exception as e:
        import traceback
        import logging
        logging.getLogger(__name__).error("Resync all failed: %s\n%s", e, traceback.format_exc())
        safe_error(e, "Failed to resync programs from Google Drive", status_code=500)


def _run_force_resync(db_path: Path | None = None) -> None:
    """Background worker that re-downloads and re-parses every GDrive program."""
    import os
    import logging

    logger = logging.getLogger(__name__)
    status = _get_resync_status(db_path)

    db = get_session(db_path)
    try:
        gdrive_imports = db.query(GDriveImport).filter(
            GDriveImport.program_id.isnot(None),
            GDriveImport.status == "success",
        ).all()


        import_info = [
            {
                "program_id": gdi.program_id,
                "gdrive_file_id": gdi.gdrive_file_id,
                "gdrive_file_name": gdi.gdrive_file_name,
                "athlete_name": gdi.program.athlete.name if gdi.program and gdi.program.athlete else None,
            }
            for gdi in gdrive_imports
        ]

        with _resync_lock:
            status["total"] = len(import_info)
            status["resynced"] = 0
            status["phase"] = "resyncing"
            status["errors"] = []

        for info in import_info:
            try:
                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    xlsx_bytes = client.export_sheet_as_xlsx(
                        info["gdrive_file_id"], db_path=db_path
                    )
                    tmp.write(xlsx_bytes)
                    tmp.flush()
                    tmp_path = tmp.name

                try:


                    import_file(
                        path=tmp_path,
                        db=db,
                        title=info["gdrive_file_name"],
                        athlete_name=info["athlete_name"],
                        existing_program_id=info["program_id"],
                    )


                    meta = client.get_file_metadata(
                        info["gdrive_file_id"], db_path=db_path
                    )
                    gdi_rec = db.query(GDriveImport).filter(
                        GDriveImport.gdrive_file_id == info["gdrive_file_id"]
                    ).first()
                    if gdi_rec:
                        gdi_rec.gdrive_modified_time = meta.get(
                            "modifiedTime", gdi_rec.gdrive_modified_time
                        )
                    db.commit()

                    with _resync_lock:
                        status["resynced"] += 1

                finally:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)

            except Exception as e:
                import traceback


                try:
                    db.rollback()
                except Exception:  # noqa: BLE001
                    pass
                logger.error(
                    "Force resync failed for program %s: %s\n%s",
                    info["program_id"], e, traceback.format_exc(),
                )
                with _resync_lock:
                    status["errors"].append(
                        f"Program {info['program_id']}: {str(e)}"
                    )

    finally:
        db.close()
        with _resync_lock:
            status["running"] = False
            status["phase"] = "done"
            status["finished_at"] = time.time()


@router.post("/force-resync-all")
def force_resync_all_programs(request: Request, db: Session = Depends(get_db)):
    """Kick off a full resync: re-download and re-parse every program.

    PRs are logged automatically during each program's re-import.

    Returns immediately. Poll GET /api/gdrive/force-resync-status for progress.
    """
    require_admin(request, db)
    db_path = _session_db_path(db)
    status = _get_resync_status(db_path)
    with _resync_lock:
        if status["running"]:
            return {
                "status": "already_running",
                "message": "A force resync is already in progress.",
                **status,
            }
        status["running"] = True
        status["phase"] = "resyncing"
        status["total"] = 0
        status["resynced"] = 0
        status["errors"] = []
        status["started_at"] = time.time()
        status["finished_at"] = None

    t = threading.Thread(target=_run_force_resync, kwargs={"db_path": db_path}, daemon=True)
    t.start()

    return {"status": "started", "message": "Force resync started in the background."}


@router.get("/force-resync-status")
def force_resync_status(request: Request, db: Session = Depends(get_db)):
    """Poll the progress of a running force resync."""
    require_admin(request, db)
    status = _get_resync_status(_session_db_path(db))
    with _resync_lock:
        return dict(status)


class ScheduleRequest(BaseModel):
    interval_minutes: int


class ScheduleStatus(BaseModel):
    enabled: bool
    interval_minutes: int
    last_run: str | None = None
    last_status: str | None = None
    running_now: bool = False


@router.get("/schedule", response_model=ScheduleStatus)
def get_schedule(request: Request, db: Session = Depends(get_db)):
    """Get the current auto-sync schedule status."""
    require_admin(request, db)
    scheduler = get_scheduler(_session_db_path(db))
    return ScheduleStatus(**scheduler.status)


@router.put("/schedule", response_model=ScheduleStatus)
def set_schedule(request: Request, req: ScheduleRequest, db: Session = Depends(get_db)):
    """Set the auto-sync interval in minutes. 0 = disable."""
    require_admin(request, db)
    scheduler = get_scheduler(_session_db_path(db))
    scheduler.set_interval(req.interval_minutes)
    return ScheduleStatus(**scheduler.status)


class OrganizeApplyRequest(BaseModel):
    root_folder_id: str
    groups: dict[str, list[str]]
    auto_watch: bool = True


class PatternPreviewRequest(BaseModel):
    template: str
    filenames: list[str]


@router.post("/organize/scan")
def organize_scan(request: Request, db: Session = Depends(get_db)):
    """Scan the root coaching folder and propose athlete-folder groupings.

    Extracts athlete names from sheet filenames, groups them, and returns
    a proposal for the coach to review before applying.
    """
    require_admin(request, db)

    watched = client.get_watched_folders(db=db)
    root_id = client.get_watched_folder_id(db=db)


    if not root_id:
        if any(f.get("id") == "root" for f in watched):
            root_id = "root"
        else:
            raise HTTPException(
                status_code=400,
                detail="Drive organization is only available when My Drive root is one of your watched folders.",
            )


    naming_pattern = None
    pattern_row = db.query(Setting).filter(Setting.key == "naming_pattern").first()
    if pattern_row and pattern_row.value:
        naming_pattern = pattern_row.value

    try:
        from ..gdrive.organize import scan_folder
        proposal = scan_folder(root_id, naming_pattern=naming_pattern, db=db)
        return proposal.to_dict()
    except RuntimeError as e:
        safe_error(e, str(e), status_code=401)
    except Exception as e:
        safe_error(e, "Failed to scan folder for organization", status_code=500)


@router.post("/organize/scan/{folder_id}")
def organize_scan_folder(folder_id: str, request: Request, db: Session = Depends(get_db)):
    """Scan a specific folder and propose athlete-folder groupings."""
    require_admin(request, db)

    naming_pattern = None
    pattern_row = db.query(Setting).filter(Setting.key == "naming_pattern").first()
    if pattern_row and pattern_row.value:
        naming_pattern = pattern_row.value

    try:
        from ..gdrive.organize import scan_folder
        proposal = scan_folder(folder_id, naming_pattern=naming_pattern, db=db)
        return proposal.to_dict()
    except RuntimeError as e:
        safe_error(e, str(e), status_code=401)
    except Exception as e:
        safe_error(e, "Failed to scan folder for organization", status_code=500)


@router.post("/organize/apply")
def organize_apply(req: OrganizeApplyRequest, request: Request, db: Session = Depends(get_db)):
    """Apply the confirmed organization, streaming progress as SSE events.

    Each `data:` frame is a JSON object with a `type` field:
        start          — {total_files, total_groups}
        folder_created — {name, id}
        folder_failed  — {name, error}
        file_moved     — {file_id, athlete_name, completed, total}
        move_failed    — {file_id, athlete_name, completed, total, error}
        complete       — {result: OrganizeResult.to_dict()}
        error          — {message}

    The final `complete` frame carries the full result payload so the
    frontend's success screen renders the same data as the legacy batch
    response did.
    """
    require_admin(request, db)

    if not req.groups:
        raise HTTPException(status_code=400, detail="No groups provided.")

    db_path = _session_db_path(db)
    events: queue.Queue[dict] = queue.Queue()
    sentinel: dict = {"__stream_done__": True}

    def worker() -> None:
        from ..gdrive.organize import apply_organization

        worker_db = get_session(db_path)
        try:
            result = apply_organization(
                root_folder_id=req.root_folder_id,
                groups=req.groups,
                auto_watch=req.auto_watch,
                db=worker_db,
                progress_callback=events.put,
            )
            events.put({"type": "complete", "result": result.to_dict()})
        except RuntimeError as e:
            events.put({"type": "error", "message": str(e) or "Not authenticated with Google Drive."})
        except Exception:  # noqa: BLE001
            logger.exception("organize/apply worker failed")
            events.put({"type": "error", "message": "Failed to apply organization"})
        finally:
            try:
                worker_db.close()
            except Exception:  # noqa: BLE001
                pass
            events.put(sentinel)

    threading.Thread(target=worker, daemon=True).start()

    def stream():
        while True:
            event = events.get()
            if event is sentinel:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


@router.get("/naming-pattern")
def get_naming_pattern(request: Request, db: Session = Depends(get_db)):
    """Get the current naming pattern and available presets."""
    require_admin(request, db)
    from ..gdrive.naming import DEFAULT_PATTERN, PRESETS

    row = db.query(Setting).filter(Setting.key == "naming_pattern").first()
    current = row.value if row and row.value else DEFAULT_PATTERN

    return {
        "current": current,
        "default": DEFAULT_PATTERN,
        "presets": PRESETS,
    }


class NamingPatternUpdate(BaseModel):
    pattern: str


@router.put("/naming-pattern")
def update_naming_pattern(req: NamingPatternUpdate, request: Request, db: Session = Depends(get_db)):
    """Update the naming pattern used for filename parsing."""
    require_admin(request, db)
    from ..gdrive.naming import compile_pattern


    try:
        compile_pattern(req.pattern)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    row = db.query(Setting).filter(Setting.key == "naming_pattern").first()
    if row:
        row.value = req.pattern
    else:
        db.add(Setting(key="naming_pattern", value=req.pattern))
    db.commit()

    return {
        "pattern": req.pattern,
        "message": "Naming pattern updated.",
    }


@router.post("/naming-pattern/preview")
def preview_naming_pattern(req: PatternPreviewRequest, request: Request, db: Session = Depends(get_db)):
    """Test a naming pattern against a list of filenames.

    Returns which files matched, what was extracted, and which didn't match.
    Used by the UI for real-time pattern testing.
    """
    require_admin(request, db)
    from ..gdrive.naming import preview_pattern, compile_pattern


    try:
        compile_pattern(req.template)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return preview_pattern(req.template, req.filenames)
