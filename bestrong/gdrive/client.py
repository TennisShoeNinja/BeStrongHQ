"""Google Drive OAuth client — handles auth flow, folder listing, and xlsx export.

Authentication uses a web-based redirect flow (same pattern as login auth)
instead of InstalledAppFlow, so it works on headless servers and supports
multi-instance deployments where each instance authenticates their own Drive.
"""

from __future__ import annotations

import io
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger(__name__)


TESTING_MODE_REFRESH_TOKEN_LIFETIME = timedelta(days=7)


SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
]


_CONFIG_DIR = Path.home() / ".bestrong" / "gdrive"
_SETTINGS_PATH = _CONFIG_DIR / "settings.json"


_LEGACY_TOKEN_PATH = _CONFIG_DIR / "token.json"
_LEGACY_CREDENTIALS_PATH = _CONFIG_DIR / "credentials.json"


GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _ensure_config_dir() -> None:
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def _get_google_client_id() -> str:
    """Read the drive-purpose Google OAuth client ID."""
    from ..utils.oauth_config import get_oauth_client

    return get_oauth_client("drive")[0]


def _get_google_client_secret() -> str:
    """Read the drive-purpose Google OAuth client secret."""
    from ..utils.oauth_config import get_oauth_client

    return get_oauth_client("drive")[1]


def _get_gdrive_redirect_uri(request=None) -> str:
    """Build the GDrive OAuth callback URI.

    Locally, uses FRONTEND_URL override if set, otherwise points at
    FastAPI on 127.0.0.1:8080 so the browser hits the API directly for
    the callback and NEXT_PUBLIC_API_URL isn't required.
    """
    mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()

    if mode == "cloud" and request is not None:
        host = request.headers.get("host", "").split(":")[0]
        return f"https://{host}/api/gdrive/auth/callback"

    frontend_url = os.environ.get("FRONTEND_URL")
    if frontend_url:
        return f"{frontend_url.rstrip('/')}/api/gdrive/auth/callback"


    return "http://127.0.0.1:8080/api/gdrive/auth/callback"


def _get_db_session(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> tuple[DBSession, bool]:
    """Get a database session for token/settings operations."""
    if db is not None:
        return db, False

    from ..models.database import get_session
    return get_session(db_path), True


def _get_setting_value(
    key: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str | None:
    """Read a instance-scoped setting from the database."""
    from ..models.orm import Setting

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        row = session.query(Setting).filter(Setting.key == key).first()
        return row.value if row else None
    finally:
        if owns_session:
            session.close()


def _set_setting_value(
    key: str,
    value: str | None,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Upsert a instance-scoped setting in the database."""
    from ..models.orm import Setting

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        row = session.query(Setting).filter(Setting.key == key).first()
        if row:
            row.value = value
        else:
            session.add(Setting(key=key, value=value))
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


def _get_json_setting(
    key: str,
    default: Any,
    *,
    legacy_key: str | None = None,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> Any:
    """Read a JSON setting from the instance DB, with legacy-file fallback."""
    raw = _get_setting_value(key, db=db, db_path=db_path)
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Ignoring invalid JSON in setting %s", key)

    if legacy_key and db is None and db_path is None:
        return get_settings().get(legacy_key, default)
    return default


def _set_json_setting(
    key: str,
    value: Any,
    *,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Write a JSON setting to the instance DB."""
    _set_setting_value(key, json.dumps(value), db=db, db_path=db_path)


def is_authenticated(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> bool:
    """Check if we have a valid GDrive token in the database.

    Actually attempts a refresh to verify the token is usable.
    """
    return get_credentials(db=db, db_path=db_path) is not None


def get_credentials(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> Credentials | None:
    """Load and refresh GDrive credentials from the database.

    Returns None if not authenticated. If the refresh token is
    revoked or expired (invalid_grant), the token row is kept but
    flagged as expired so the UI can show a "reconnect" banner
    instead of appearing to have never connected.
    """
    from ..models.orm import GDriveToken

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        token_row = session.query(GDriveToken).first()
        if not token_row:
            return None


        if token_row.connection_status == "expired":
            return None

        creds = Credentials(
            token=token_row.access_token,
            refresh_token=token_row.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=_get_google_client_id(),
            client_secret=_get_google_client_secret(),
            scopes=SCOPES,
        )


        if token_row.token_expiry:
            creds.expiry = token_row.token_expiry

        if creds.expired and creds.refresh_token:
            creds.refresh(Request())

            token_row.access_token = creds.token
            token_row.token_expiry = creds.expiry
            if token_row.connection_status != "active":
                token_row.connection_status = "active"
                token_row.last_error = None
                token_row.last_error_at = None
            session.commit()

        return creds if creds.valid else None

    except Exception as exc:


        logger.warning("GDrive token refresh failed (%s). Flagging as expired.", exc)
        try:
            token_row = session.query(GDriveToken).first()
            if token_row:
                token_row.connection_status = "expired"
                token_row.last_error = str(exc)[:500]
                token_row.last_error_at = datetime.utcnow()
                session.commit()
                _notify_connection_expired(token_row.email, str(exc))
        except Exception:
            session.rollback()
        return None
    finally:
        if owns_session:
            session.close()


def _notify_connection_expired(email: str, error: str) -> None:
    """Fire an alert when the Drive connection transitions to expired.

    Delegates to the alerts module so email/Slack/etc. can be wired in
    without touching this hot path.
    """
    try:
        from .alerts import send_connection_expired_alert
        send_connection_expired_alert(email, error)
    except Exception as exc:
        logger.warning("Failed to dispatch connection-expired alert: %s", exc)


def _is_testing_mode() -> bool:
    """Whether Google's 7-day refresh-token rule applies to our consent screen.

    True by default — flip GOOGLE_OAUTH_TESTING_MODE=false in .env once
    the consent screen is published to Production.
    """
    val = os.environ.get("GOOGLE_OAUTH_TESTING_MODE", "true").strip().lower()
    return val not in ("false", "0", "no", "off")


def get_connection_health(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict[str, Any]:
    """Return the stored Drive connection health for the UI.

    Shape:
        {
            "status": "active" | "expired" | "disconnected",
            "email": str | None,
            "last_error": str | None,
            "last_error_at": str | None,  # ISO timestamp
            "last_successful_sync_at": str | None,
            "refresh_token_issued_at": str | None,
            "refresh_token_expires_at": str | None,
              # Only populated in Testing mode, where Google's 7-day rule
              # applies. Null once the consent screen is verified/published.
        }
    """
    from ..models.orm import GDriveToken

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        token_row = session.query(GDriveToken).first()
        if not token_row:
            return {
                "status": "disconnected",
                "email": None,
                "last_error": None,
                "last_error_at": None,
                "last_successful_sync_at": None,
                "refresh_token_issued_at": None,
                "refresh_token_expires_at": None,
            }

        issued_at = token_row.refresh_token_issued_at
        expires_at: datetime | None = None
        if issued_at and _is_testing_mode():
            expires_at = issued_at + TESTING_MODE_REFRESH_TOKEN_LIFETIME


        def _utc_iso(dt: datetime | None) -> str | None:
            return dt.isoformat() + "Z" if dt else None

        return {
            "status": token_row.connection_status or "active",
            "email": token_row.email,
            "last_error": token_row.last_error,
            "last_error_at": _utc_iso(token_row.last_error_at),
            "last_successful_sync_at": _utc_iso(token_row.last_successful_sync_at),
            "refresh_token_issued_at": _utc_iso(issued_at),
            "refresh_token_expires_at": _utc_iso(expires_at),
        }
    finally:
        if owns_session:
            session.close()


def mark_sync_success(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Record a successful sync run — clears any expired flag."""
    from ..models.orm import GDriveToken

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        token_row = session.query(GDriveToken).first()
        if token_row:
            token_row.last_successful_sync_at = datetime.utcnow()
            if token_row.connection_status != "active":
                token_row.connection_status = "active"
                token_row.last_error = None
                token_row.last_error_at = None
            session.commit()
    except Exception:
        session.rollback()
    finally:
        if owns_session:
            session.close()


def mark_sync_auth_failure(
    error: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Flag the stored token as expired after a scheduler auth failure."""
    from ..models.orm import GDriveToken

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        token_row = session.query(GDriveToken).first()
        if not token_row:
            return
        previously_active = token_row.connection_status != "expired"
        token_row.connection_status = "expired"
        token_row.last_error = error[:500]
        token_row.last_error_at = datetime.utcnow()
        session.commit()
        if previously_active:
            _notify_connection_expired(token_row.email, error)
    except Exception:
        session.rollback()
    finally:
        if owns_session:
            session.close()


def save_tokens(
    access_token: str,
    refresh_token: str,
    expiry: datetime | None,
    email: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Store GDrive OAuth tokens in the database.

    Upserts by email so re-authenticating replaces the old tokens.
    """
    from ..models.orm import GDriveToken

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        existing = session.query(GDriveToken).filter(
            GDriveToken.email == email
        ).first()

        now = datetime.utcnow()
        if existing:
            existing.access_token = access_token
            existing.refresh_token = refresh_token
            existing.token_expiry = expiry
            existing.scopes = json.dumps(SCOPES)
            existing.connection_status = "active"
            existing.last_error = None
            existing.last_error_at = None
            existing.refresh_token_issued_at = now
            existing.updated_at = now
        else:

            session.query(GDriveToken).delete()
            token_row = GDriveToken(
                email=email,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expiry=expiry,
                scopes=json.dumps(SCOPES),
                connection_status="active",
                refresh_token_issued_at=now,
            )
            session.add(token_row)

        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


def get_connected_email(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str | None:
    """Return the email of the currently connected GDrive account, or None."""
    from ..models.orm import GDriveToken

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        token_row = session.query(GDriveToken).first()
        return token_row.email if token_row else None
    finally:
        if owns_session:
            session.close()


def disconnect(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Remove all stored GDrive tokens (disconnect)."""
    from ..models.orm import GDriveToken

    session, owns_session = _get_db_session(db=db, db_path=db_path)
    try:
        session.query(GDriveToken).delete()
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


def has_credentials_file() -> bool:
    """Check if the legacy OAuth credentials.json file exists.

    In the new web flow, credentials come from env vars (GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET), so this always returns True when those are set.
    Falls back to checking the legacy file for backward compatibility.
    """
    if _get_google_client_id() and _get_google_client_secret():
        return True
    return _LEGACY_CREDENTIALS_PATH.exists()


def _get_service(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
):
    """Build the Drive API service object."""
    creds = get_credentials(db=db, db_path=db_path)
    if creds is None:
        raise RuntimeError("Not authenticated with Google Drive. Connect your account first.")
    return build("drive", "v3", credentials=creds)


def get_settings() -> dict[str, Any]:
    """Load legacy file-backed settings.

    Instance-scoped Drive folder config now lives in the database; the file
    remains only for legacy scheduler state and migration fallback.
    """
    if not _SETTINGS_PATH.exists():
        return {}
    return json.loads(_SETTINGS_PATH.read_text())


def save_settings(settings: dict[str, Any]) -> None:
    """Persist settings."""
    _ensure_config_dir()
    _SETTINGS_PATH.write_text(json.dumps(settings, indent=2))


def get_watched_folder_id(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> str | None:
    """Get the configured watched root folder ID for this instance."""
    value = _get_setting_value("gdrive_folder_id", db=db, db_path=db_path)
    if value:
        return value
    if db is not None or db_path is not None:
        return None
    return get_settings().get("folder_id")


def set_watched_folder_id(
    folder_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    _set_setting_value("gdrive_folder_id", folder_id, db=db, db_path=db_path)


def get_watched_folders(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[dict[str, str]]:
    """Get the list of individually watched folders [{id, name}, ...]."""
    return _get_json_setting(
        "gdrive_watched_folders",
        [],
        legacy_key="watched_folders",
        db=db,
        db_path=db_path,
    )


def set_watched_folders(
    folders: list[dict[str, str]],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    """Set the list of individually watched folders.

    The two valid configurations are:
      - Exactly one entry with id="root" (loose sheets in My Drive — initial
        state, before the coach has run the Organize feature), or
      - One or more named athlete folders (id != "root").

    Mixing root with named folders is rejected: once an athlete folder exists,
    the coach is expected to drop the root entry. Allowing both at once would
    re-import every loose sheet on each sync, including any file that's been
    organized into an athlete folder (each pulled in twice with different
    folder names).
    """
    has_root = any(f.get("id") == "root" for f in folders)
    has_named = any(f.get("id") and f["id"] != "root" for f in folders)
    if has_root and has_named:
        raise ValueError(
            "Cannot watch My Drive root and named folders at the same time. "
            "Pick either the root (loose sheets) or a set of athlete folders."
        )
    _set_json_setting("gdrive_watched_folders", folders, db=db, db_path=db_path)
    _set_setting_value("gdrive_folder_id", None, db=db, db_path=db_path)


def get_excluded_folders(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[str]:
    """Get list of folder names to skip during sync."""
    return _get_json_setting(
        "gdrive_excluded_folders",
        [],
        legacy_key="excluded_folders",
        db=db,
        db_path=db_path,
    )


def set_excluded_folders(
    names: list[str],
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> None:
    _set_json_setting("gdrive_excluded_folders", names, db=db, db_path=db_path)


def get_scan_subfolders(
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> bool:
    """Whether to scan athlete subfolders (True) or just the root folder."""
    return _get_json_setting(
        "gdrive_scan_subfolders",
        True,
        legacy_key="scan_subfolders",
        db=db,
        db_path=db_path,
    )


def list_folders(
    parent_id: str = "root",
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """List folders inside a parent folder."""
    service = _get_service(db=db, db_path=db_path)
    q = (
        f"'{parent_id}' in parents "
        "and mimeType = 'application/vnd.google-apps.folder' "
        "and trashed = false"
    )
    results = service.files().list(
        q=q,
        fields="files(id, name, modifiedTime)",
        orderBy="name",
        pageSize=100,
    ).execute()
    return results.get("files", [])


def list_sheets_in_folder(
    folder_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """List spreadsheets the connected coach owns inside a folder.

    Includes both native Google Sheets and .xlsx uploads. Coaches often upload
    program files straight from Excel without converting, so the sync pipeline
    has to handle both formats.

    Files NOT owned by the connected account are filtered out at both the
    Drive query layer (`'me' in owners`) and a post-list check on `ownedByMe`.
    Without this filter, a sheet shared with the coach (e.g., another coach's
    program file shared with them as a client) that happens to live in any
    watched folder would be parsed and create a phantom athlete from the
    filename pattern. See bestrong/gdrive/sync.py for downstream handling.
    """
    service = _get_service(db=db, db_path=db_path)
    q = (
        f"'{folder_id}' in parents "
        f"and (mimeType = '{GOOGLE_SHEET_MIME}' or mimeType = '{XLSX_MIME}') "
        "and 'me' in owners "
        "and trashed = false"
    )
    results = service.files().list(
        q=q,
        fields="files(id, name, modifiedTime, createdTime, mimeType, ownedByMe)",
        orderBy="name",
        pageSize=200,
    ).execute()
    files = results.get("files", [])
    return [f for f in files if f.get("ownedByMe", False)]


def export_sheet_as_xlsx(
    file_id: str,
    mime_type: str | None = None,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> bytes:
    """Return xlsx bytes for a spreadsheet in Drive.

    Native Google Sheets are exported via files.export_media (converting
    to xlsx on Google's side). Already-xlsx uploads are streamed directly
    via files.get_media since no conversion is needed.

    Pass mime_type to skip an extra metadata round-trip when the caller
    already has it (e.g., from list_sheets_in_folder).
    """
    service = _get_service(db=db, db_path=db_path)
    if mime_type is None:
        meta = service.files().get(fileId=file_id, fields="mimeType").execute()
        mime_type = meta.get("mimeType", "")

    if mime_type == GOOGLE_SHEET_MIME:
        request = service.files().export_media(fileId=file_id, mimeType=XLSX_MIME)
    elif mime_type == XLSX_MIME:
        request = service.files().get_media(fileId=file_id)
    else:
        raise ValueError(f"Unsupported spreadsheet mimeType: {mime_type!r}")

    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buffer.getvalue()


def get_file_metadata(
    file_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict:
    """Get metadata for a single file."""
    service = _get_service(db=db, db_path=db_path)
    return service.files().get(
        fileId=file_id,
        fields="id,name,modifiedTime,createdTime,mimeType",
    ).execute()


def list_all_files(
    folder_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """List ALL files (any type) directly inside a folder. Non-recursive."""
    service = _get_service(db=db, db_path=db_path)
    q = (
        f"'{folder_id}' in parents "
        "and trashed = false"
    )
    all_files: list[dict] = []
    page_token = None

    while True:
        results = service.files().list(
            q=q,
            fields="nextPageToken, files(id, name, mimeType, modifiedTime, createdTime)",
            orderBy="name",
            pageSize=200,
            pageToken=page_token,
        ).execute()
        all_files.extend(results.get("files", []))
        page_token = results.get("nextPageToken")
        if not page_token:
            break

    return all_files


def create_folder(
    name: str,
    parent_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict:
    """Create a new folder inside a parent folder.

    Returns the created folder's metadata (id, name).
    """
    service = _get_service(db=db, db_path=db_path)
    file_metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    folder = service.files().create(
        body=file_metadata,
        fields="id, name",
    ).execute()
    logger.info("Created folder '%s' (id=%s) in parent %s", name, folder["id"], parent_id)
    return folder


def move_file(
    file_id: str,
    new_parent_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> dict:
    """Move a file to a new parent folder.

    Removes all existing parents and adds the new one.
    Returns updated file metadata.
    """
    service = _get_service(db=db, db_path=db_path)

    file = service.files().get(fileId=file_id, fields="parents").execute()
    previous_parents = ",".join(file.get("parents", []))


    updated = service.files().update(
        fileId=file_id,
        addParents=new_parent_id,
        removeParents=previous_parents,
        fields="id, name, parents",
    ).execute()
    return updated


def get_shared_emails(
    file_id: str,
    db: DBSession | None = None,
    db_path: Path | str | None = None,
) -> list[dict]:
    """Get non-owner email addresses that a file/folder is shared with.

    Returns a list of dicts with 'email' and 'role' keys, excluding the
    file owner and any domain/anyone permissions (no email).
    """
    service = _get_service(db=db, db_path=db_path)
    try:
        perms = service.permissions().list(
            fileId=file_id,
            fields="permissions(emailAddress,role,type)",
            pageSize=50,
        ).execute()
        results = []
        for p in perms.get("permissions", []):
            email = p.get("emailAddress")
            role = p.get("role")
            ptype = p.get("type")

            if not email or role == "owner" or ptype in ("domain", "anyone"):
                continue
            results.append({"email": email, "role": role})
        return results
    except Exception as exc:
        logger.warning("Could not fetch permissions for %s: %s", file_id, exc)
        return []
