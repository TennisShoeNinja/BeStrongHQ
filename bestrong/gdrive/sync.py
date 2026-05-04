"""Sync service — pulls new/updated Google Sheets and auto-imports them."""

from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session as DBSession

from ..models.orm import GDriveImport, RawProgram
from ..models.database import get_session, init_db, staging_dir_for
from ..parser.adapters import has_adapter
from ..services import import_file, resolve_parser_id
from ..utils.log_sanitizer import sanitize
from . import client

logger = logging.getLogger(__name__)


DEFAULT_EXCLUDED = {
    "archived athletes",
    "documents",
    "archive",
    "templates",
    "temp",
    "trash",
}


SKIP_FILENAME_PATTERNS = [
    "attempt selection",
    "attempts",
    "regionals",
    "meet day",
    "warmup loads",
    "calculator",
    "gut cut",
    "water cut",
    "weight cut",
]


def _is_program_sheet(name: str) -> bool:
    """Return True if the sheet name could be a training program.

    Only filters out the universal non-program filename patterns
    (attempt selectors, gut/water cuts, calculators, etc.) that no
    coach uses for actual programs. The affirmative "is this a
    program?" decision is left to each adapter's ``can_parse`` so
    coach-specific naming conventions are not second-guessed at the
    sync layer.
    """
    lower = name.lower()
    for pattern in SKIP_FILENAME_PATTERNS:
        if pattern in lower:
            return False
    return True


@dataclass
class SyncResult:
    """Summary of a sync run."""

    imported: list[dict] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    folders_scanned: list[str] = field(default_factory=list)
    folders_excluded: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.imported) + len(self.skipped) + len(self.errors)

    def to_dict(self) -> dict:
        return {
            "imported": self.imported,
            "skipped": self.skipped,
            "errors": self.errors,
            "folders_scanned": self.folders_scanned,
            "folders_excluded": self.folders_excluded,
            "total_found": self.total,
            "total_imported": len(self.imported),
            "total_skipped": len(self.skipped),
            "total_errors": len(self.errors),
        }


def _latest_import(db: DBSession, file_id: str) -> GDriveImport | None:
    """Most-recent gdrive_imports row for a file_id.

    Per-file dedup, not per-row. The schema enforces one row per file_id,
    but ordering by ``imported_at`` keeps the dedup decision stable if a
    duplicate ever sneaks in (e.g., partial migration, manual repair) so
    the freshest stored modified_time always wins.
    """
    return (
        db.query(GDriveImport)
        .filter(GDriveImport.gdrive_file_id == file_id)
        .order_by(GDriveImport.imported_at.desc())
        .first()
    )


def _needs_import(db: DBSession, file_id: str, modified_time: str) -> bool:
    """Check if a file needs importing (new or modified since last import)."""
    existing = _latest_import(db, file_id)
    if existing is None:
        return True

    if existing.gdrive_modified_time != modified_time:
        return True

    if existing.status == "error":
        return True
    return False


def _record_import(
    db: DBSession,
    file_id: str,
    file_name: str,
    modified_time: str,
    program_id: int | None = None,
    status: str = "success",
    error_message: str | None = None,
) -> None:
    """Record an import attempt (upsert by file_id)."""
    existing = _latest_import(db, file_id)
    if existing:
        existing.gdrive_file_name = file_name
        existing.gdrive_modified_time = modified_time
        existing.program_id = program_id
        existing.status = status
        existing.error_message = error_message


        existing.imported_at = datetime.now(timezone.utc)
    else:
        db.add(GDriveImport(
            gdrive_file_id=file_id,
            gdrive_file_name=file_name,
            gdrive_modified_time=modified_time,
            program_id=program_id,
            status=status,
            error_message=error_message,
        ))


def _get_db_session(
    db: DBSession | None = None,
    db_path: Path | None = None,
) -> tuple[DBSession, bool]:
    """Return a sync DB session plus whether this helper owns it."""
    if db is not None:
        return db, False
    init_db(db_path)
    return get_session(db_path), True


def _resolve_db_path(
    db: DBSession | None,
    db_path: Path | None,
) -> Path | None:
    """Recover the on-disk DB path from a session when not given explicitly."""
    if db_path is not None:
        return Path(db_path)
    if db is not None:
        try:
            url_db = db.get_bind().url.database
            if url_db:
                return Path(url_db)
        except Exception:
            return None
    return None


def _stage_raw_file(
    db: DBSession,
    sheet: dict,
    staging_dir: Path,
) -> dict:
    """Download a sheet without parsing and upsert a RawProgram row.

    Returns a summary dict mirroring the shape used for imported entries
    so the SyncResult shows a coherent per-file outcome ("staged, no
    parser yet"). Caller is responsible for committing the outer
    transaction.
    """
    file_id = sheet["id"]
    file_name = sheet["name"]
    modified_time = sheet.get("modifiedTime", "")
    folder_name = sheet.get("_folder_name", "")
    mime_type = sheet.get("mimeType")

    xlsx_bytes = client.export_sheet_as_xlsx(file_id, mime_type=mime_type, db=db)
    local_path = staging_dir / f"{file_id}.xlsx"
    local_path.write_bytes(xlsx_bytes)

    existing = (
        db.query(RawProgram)
        .filter(RawProgram.gdrive_file_id == file_id)
        .first()
    )
    if existing:
        existing.gdrive_file_name = file_name
        existing.gdrive_modified_time = modified_time
        existing.folder_name = folder_name or None
        existing.local_path = str(local_path)
        existing.processed_at = None
        existing.error_message = None
    else:
        db.add(RawProgram(
            gdrive_file_id=file_id,
            gdrive_file_name=file_name,
            gdrive_modified_time=modified_time,
            folder_name=folder_name or None,
            local_path=str(local_path),
        ))

    return {
        "id": file_id,
        "name": file_name,
        "folder": folder_name,
        "athlete": folder_name,
        "program_id": None,
        "staged": True,
    }


def _collect_sheets(
    root_folder_id: str,
    excluded_names: set[str],
    db: DBSession | None = None,
    db_path: Path | None = None,
) -> list[dict]:
    """
    Collect all Google Sheets from athlete subfolders.

    Scans the root folder for subfolders (athlete folders), skips excluded
    folder names, then collects all Google Sheets from each athlete folder.
    Ignores loose sheets in the root folder.
    """
    all_sheets: list[dict] = []
    scanned: list[str] = []
    excluded: list[str] = []


    subfolders = client.list_folders(root_folder_id, db=db, db_path=db_path)
    logger.info("Found %d subfolders in root", len(subfolders))

    for folder in subfolders:
        folder_name = folder["name"]


        if folder_name.lower().strip() in excluded_names:
            excluded.append(folder_name)
            logger.info("Skipping excluded folder: %s", sanitize(folder_name))
            continue


        sheets = client.list_sheets_in_folder(folder["id"], db=db, db_path=db_path)
        logger.info("Found %d sheets in %s", len(sheets), sanitize(folder_name))


        for sheet in sheets:
            sheet["_folder_name"] = folder_name
            sheet["_folder_id"] = folder["id"]

        all_sheets.extend(sheets)
        scanned.append(folder_name)

    return all_sheets, scanned, excluded


def sync_folder(
    folder_id: str | None = None,
    db_path: Path | None = None,
    db: DBSession | None = None,
    force: bool = False,
) -> SyncResult:
    """
    Scan a Google Drive folder's subfolders for Google Sheets and import new/updated ones.

    The root folder is expected to contain athlete-named subfolders.
    Each subfolder is scanned for Google Sheets (program files).
    Loose sheets in the root are ignored. Excluded folders are skipped.

    Args:
        folder_id: Google Drive folder ID. If None, uses the saved watched folder.
        db_path: Optional database path override.
        force: When True, bypass the modifiedTime dedup check and re-import
               every program file. Useful when content changed but Drive's
               modifiedTime didn't bump (rare with API-mediated edits).

    Returns:
        SyncResult with details of what was imported, skipped, or errored.
    """

    watched_folders = client.get_watched_folders(db=db, db_path=db_path)

    if folder_id is None and not watched_folders:
        folder_id = client.get_watched_folder_id(db=db, db_path=db_path)
    if not folder_id and not watched_folders:
        raise ValueError("No folder configured. Set watched folders first.")

    if not client.is_authenticated(db=db, db_path=db_path):
        raise RuntimeError("Not authenticated with Google Drive. Run auth flow first.")

    result = SyncResult()


    _backfill_db, owns_backfill_db = _get_db_session(db=db, db_path=db_path)
    try:
        from ..models.orm import Program
        records = _backfill_db.query(GDriveImport).filter(
            GDriveImport.program_id.isnot(None),
            GDriveImport.status == "success",
        ).all()
        for rec in records:
            prog = _backfill_db.get(Program, rec.program_id)
            if prog and not prog.google_sheet_url:
                prog.google_sheet_url = f"https://docs.google.com/spreadsheets/d/{rec.gdrive_file_id}"
        _backfill_db.commit()
    except Exception:
        _backfill_db.rollback()
    finally:
        if owns_backfill_db:
            _backfill_db.close()

    if watched_folders:


        sheets = []
        scanned = []
        for wf in watched_folders:
            folder_sheets = client.list_sheets_in_folder(
                wf["id"], db=db, db_path=db_path
            )
            is_root = wf["id"] == "root"
            for s in folder_sheets:
                s["_folder_name"] = "" if is_root else wf["name"]
                s["_folder_id"] = wf["id"]
            sheets.extend(folder_sheets)
            scanned.append(wf["name"])
        result.folders_scanned = scanned
        result.folders_excluded = []
        logger.info(
            "Multi-folder mode: collected %d sheets from %d watched folders",
            len(sheets), len(scanned),
        )
    else:

        excluded_names = {n.lower().strip() for n in DEFAULT_EXCLUDED}
        user_excluded = client.get_excluded_folders(db=db, db_path=db_path)
        excluded_names.update(n.lower().strip() for n in user_excluded)

        sheets, scanned, excluded = _collect_sheets(
            folder_id, excluded_names, db=db, db_path=db_path
        )
        result.folders_scanned = scanned
        result.folders_excluded = excluded

        logger.info(
            "Collected %d sheets from %d folders (%d excluded)",
            len(sheets), len(scanned), len(excluded),
        )

    db, owns_db = _get_db_session(db=db, db_path=db_path)


    resolved_db_path = _resolve_db_path(db, db_path)
    parser_id = resolve_parser_id(db, resolved_db_path)
    parser_ready = has_adapter(parser_id)
    staging_dir = staging_dir_for(resolved_db_path) if not parser_ready else None
    if not parser_ready:
        logger.info(
            "Sync staging-only mode: parser_id=%r has no registered adapter; "
            "files will be downloaded to %s for later parse-staged",
            parser_id, staging_dir,
        )

    try:
        for sheet in sheets:
            file_id = sheet["id"]
            file_name = sheet["name"]
            modified_time = sheet.get("modifiedTime", "")
            folder_name = sheet.get("_folder_name", "")
            mime_type = sheet.get("mimeType")


            if "copy of" in file_name.lower():
                result.skipped.append({
                    "id": file_id,
                    "name": file_name,
                    "folder": folder_name,
                    "reason": "copy of original — skipped to prevent duplicates",
                })
                logger.info(
                    "Skipping %s/%s (copy of original — skipped to prevent duplicates)",
                    sanitize(folder_name), sanitize(file_name),
                )
                continue


            if not _is_program_sheet(file_name):
                result.skipped.append({
                    "id": file_id,
                    "name": file_name,
                    "folder": folder_name,
                    "reason": "not a training program",
                })
                logger.info("Skipping %s/%s (not a training program)", sanitize(folder_name), sanitize(file_name))
                continue


            if not force and not _needs_import(db, file_id, modified_time):
                result.skipped.append({
                    "id": file_id,
                    "name": file_name,
                    "folder": folder_name,
                    "reason": "already imported",
                })
                logger.info("Skipping %s/%s (already imported, unchanged)", sanitize(folder_name), sanitize(file_name))
                continue


            if not parser_ready:
                logger.info(
                    "Staging %s/%s (no adapter for parser_id=%r yet)",
                    sanitize(folder_name), sanitize(file_name), parser_id,
                )
                try:
                    staged = _stage_raw_file(db, sheet, staging_dir)
                    _record_import(
                        db, file_id, file_name, modified_time,
                        program_id=None, status="staged",
                    )
                    db.commit()
                    result.imported.append(staged)
                except Exception as exc:
                    db.rollback()
                    error_msg = f"staging failed: {exc}"
                    _record_import(
                        db, file_id, file_name, modified_time,
                        status="error", error_message=error_msg,
                    )
                    db.commit()
                    result.errors.append({
                        "id": file_id,
                        "name": file_name,
                        "folder": folder_name,
                        "error": error_msg,
                    })
                    logger.warning(
                        "Failed to stage %s/%s: %s",
                        sanitize(folder_name), sanitize(file_name), error_msg,
                    )
                continue


            logger.info("Importing %s/%s ...", sanitize(folder_name), sanitize(file_name))
            try:
                xlsx_bytes = client.export_sheet_as_xlsx(
                    file_id, mime_type=mime_type, db=db, db_path=db_path
                )


                with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
                    tmp.write(xlsx_bytes)
                    tmp_path = Path(tmp.name)

                try:


                    existing_program_id = None
                    resolved_athlete_name = folder_name
                    prev_import = _latest_import(db, file_id)
                    if prev_import and prev_import.program_id:
                        existing_program_id = prev_import.program_id

                        from ..models.orm import Program
                        prev_prog = db.get(Program, prev_import.program_id)
                        if prev_prog and prev_prog.athlete:
                            resolved_athlete_name = prev_prog.athlete.name


                    import_result = import_file(
                        path=tmp_path,
                        db=db,
                        title=file_name,
                        athlete_name=resolved_athlete_name,
                        existing_program_id=existing_program_id,
                    )
                    program_id = import_result.get("program_id")


                    if program_id:
                        from ..models.orm import Program
                        prog = db.get(Program, program_id)
                        if prog:
                            prog.google_sheet_url = f"https://docs.google.com/spreadsheets/d/{file_id}"

                    _record_import(
                        db, file_id, file_name, modified_time,
                        program_id=program_id, status="success",
                    )
                    db.commit()

                    result.imported.append({
                        "id": file_id,
                        "name": file_name,
                        "folder": folder_name,
                        "athlete": import_result.get("athlete_name"),
                        "program_id": program_id,
                        "sessions": import_result.get("sessions_imported"),
                        "exercises": import_result.get("exercises_imported"),
                    })
                    logger.info(
                        "Imported %s/%s → program_id=%s (%d sessions)",
                        sanitize(folder_name), sanitize(file_name), program_id,
                        import_result.get("sessions_imported", 0),
                    )
                finally:
                    tmp_path.unlink(missing_ok=True)

            except Exception as exc:


                db.rollback()
                error_msg = str(exc)
                _record_import(
                    db, file_id, file_name, modified_time,
                    status="error", error_message=error_msg,
                )
                db.commit()

                result.errors.append({
                    "id": file_id,
                    "name": file_name,
                    "folder": folder_name,
                    "error": error_msg,
                })
                logger.warning("Failed to import %s/%s: %s", sanitize(folder_name), sanitize(file_name), error_msg)


        _update_athlete_emails_from_sharing(db, sheets, db_path=db_path)

    finally:
        if owns_db:
            db.close()

    return result


def _update_athlete_emails_from_sharing(
    db: DBSession,
    sheets: list[dict],
    db_path: Path | None = None,
) -> None:
    """Best-effort: fill in blank athlete emails using sharing on this run's sheets.

    Only touches athletes whose ``email`` is currently None — once set,
    the field is never re-checked here (use the CLI for that).
    """
    from collections import defaultdict
    from .email_scrape import find_athlete_by_folder, scrape_for_athlete

    sheets_by_folder: dict[str, list[dict]] = defaultdict(list)
    for sheet in sheets:
        fname = sheet.get("_folder_name", "")
        if fname:
            sheets_by_folder[fname].append(sheet)

    if not sheets_by_folder:
        return

    coach_email = client.get_connected_email(db=db, db_path=db_path)

    for folder_name, folder_sheets in sheets_by_folder.items():
        athlete = find_athlete_by_folder(db, folder_name)
        if not athlete or athlete.email:
            continue

        folder_sheets.sort(key=lambda s: s.get("modifiedTime", ""), reverse=True)
        file_ids = [s["id"] for s in folder_sheets if s.get("id")]

        try:
            if scrape_for_athlete(db, athlete, file_ids, coach_email, db_path=db_path):
                db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning(
                "Failed to update email for '%s': %s",
                sanitize(folder_name), exc,
            )


def get_import_history(
    db_path: Path | None = None,
    db: DBSession | None = None,
) -> list[dict]:
    """Get history of all Google Drive imports."""
    db, owns_db = _get_db_session(db=db, db_path=db_path)
    try:
        records = db.query(GDriveImport).order_by(GDriveImport.imported_at.desc()).all()
        return [
            {
                "id": r.id,
                "gdrive_file_id": r.gdrive_file_id,
                "gdrive_file_name": r.gdrive_file_name,
                "gdrive_modified_time": r.gdrive_modified_time,
                "program_id": r.program_id,
                "imported_at": r.imported_at.isoformat() if r.imported_at else None,
                "status": r.status,
                "error_message": r.error_message,
            }
            for r in records
        ]
    finally:
        if owns_db:
            db.close()
