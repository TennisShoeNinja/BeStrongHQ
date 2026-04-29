"""Google Drive organization service.

Scans a root coaching folder for loose spreadsheets, extracts athlete names
from filenames, and proposes grouping them into per-athlete subfolders.
After coach review, creates folders and moves files.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy.orm import Session as DBSession

from . import client
from .naming import extract_athlete_name

ProgressCallback = Callable[[dict], None]

logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    """Normalize an athlete name for grouping (lowercase, strip whitespace)."""
    return name.strip().lower()


@dataclass
class OrganizeProposal:
    """Result of scanning a folder for organization."""


    groups: dict[str, list[dict]] = field(default_factory=dict)


    unrecognized: list[dict] = field(default_factory=list)


    already_organized: list[dict] = field(default_factory=list)


    existing_folders: list[dict] = field(default_factory=list)


    root_folder_id: str = ""

    def to_dict(self) -> dict:
        return {
            "groups": {
                name: {
                    "athlete_name": name,
                    "sheets": sheets,
                    "count": len(sheets),
                }
                for name, sheets in self.groups.items()
            },
            "unrecognized": self.unrecognized,
            "already_organized": self.already_organized,
            "existing_folders": self.existing_folders,
            "root_folder_id": self.root_folder_id,
            "summary": {
                "total_sheets": (
                    sum(len(s) for s in self.groups.values())
                    + len(self.unrecognized)
                    + len(self.already_organized)
                ),
                "matched_athletes": len(self.groups),
                "matched_sheets": sum(len(s) for s in self.groups.values()),
                "unrecognized_count": len(self.unrecognized),
                "already_organized_count": len(self.already_organized),
            },
        }


def scan_folder(
    folder_id: str,
    naming_pattern: str | None = None,
    db: DBSession | None = None,
) -> OrganizeProposal:
    """Scan a root folder and propose how to organize its contents.

    Walks all files directly in the root folder (non-recursive).
    Sheets with an extractable athlete name are grouped.
    Sheets without a recognizable name go into 'unrecognized'.
    Existing subfolders are listed so the UI can show them.

    Args:
        folder_id: The Google Drive folder ID to scan.
        naming_pattern: Template string for filename parsing.
            Defaults to the standard pattern if not provided.

    Returns:
        An OrganizeProposal with the grouping.
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Drive.")

    proposal = OrganizeProposal(root_folder_id=folder_id)


    subfolders = client.list_folders(folder_id, db=db)
    proposal.existing_folders = [
        {"id": f["id"], "name": f["name"]}
        for f in subfolders
    ]
    existing_folder_names = {
        _normalize_name(f["name"]) for f in subfolders
    }


    all_files = client.list_all_files(folder_id, db=db)


    for file in all_files:
        mime = file.get("mimeType", "")


        if mime == "application/vnd.google-apps.folder":
            continue


        if mime not in (client.GOOGLE_SHEET_MIME, client.XLSX_MIME):
            continue

        name = file.get("name", "")
        file_info = {
            "id": file["id"],
            "name": name,
            "modifiedTime": file.get("modifiedTime", ""),
        }


        athlete_name = extract_athlete_name(name, naming_pattern)

        if athlete_name:


            norm = _normalize_name(athlete_name)

            if norm not in {_normalize_name(k) for k in proposal.groups}:

                proposal.groups[athlete_name] = [file_info]
            else:

                for existing_key in proposal.groups:
                    if _normalize_name(existing_key) == norm:
                        proposal.groups[existing_key].append(file_info)
                        break
        else:
            proposal.unrecognized.append(file_info)


    for athlete_name in list(proposal.groups.keys()):
        if _normalize_name(athlete_name) in existing_folder_names:


            pass


    for subfolder in subfolders:
        sheets = client.list_sheets_in_folder(subfolder["id"], db=db)
        for sheet in sheets:
            proposal.already_organized.append({
                "id": sheet["id"],
                "name": sheet.get("name", ""),
                "folder": subfolder["name"],
                "modifiedTime": sheet.get("modifiedTime", ""),
            })

    return proposal


@dataclass
class OrganizeResult:
    """Result of applying an organization proposal."""

    folders_created: list[dict] = field(default_factory=list)
    files_moved: int = 0
    errors: list[str] = field(default_factory=list)
    watched_folders_set: int = 0

    def to_dict(self) -> dict:
        return {
            "folders_created": self.folders_created,
            "files_moved": self.files_moved,
            "errors": self.errors,
            "watched_folders_set": self.watched_folders_set,
        }


def apply_organization(
    root_folder_id: str,
    groups: dict[str, list[str]],
    auto_watch: bool = True,
    db: DBSession | None = None,
    progress_callback: ProgressCallback | None = None,
) -> OrganizeResult:
    """Create folders and move files according to the confirmed grouping.

    Args:
        root_folder_id: The parent folder where athlete folders are created.
        groups: Mapping of athlete_name -> list of file IDs to move.
            The coach may have edited names or reassigned files.
        auto_watch: If True, register all athlete folders as watched
            folders for future syncs.
        progress_callback: Optional callable invoked with progress events as
            organization proceeds. Each event is a dict with a `type` field:
            `start`, `folder_created`, `file_moved`, `move_failed`,
            `folder_failed`. The endpoint layer turns these into SSE frames.
            Failures inside the callback are swallowed so streaming bugs
            never poison the underlying organize work.

    Returns:
        OrganizeResult with details of what was done.
    """
    if not client.is_authenticated(db=db):
        raise RuntimeError("Not authenticated with Google Drive.")

    def _emit(event: dict) -> None:
        if progress_callback is None:
            return
        try:
            progress_callback(event)
        except Exception:  # noqa: BLE001
            logger.exception("organize progress_callback raised; ignoring")

    result = OrganizeResult()


    existing_folders = client.list_folders(root_folder_id, db=db)
    folder_lookup: dict[str, str] = {
        _normalize_name(f["name"]): f["id"]
        for f in existing_folders
    }

    folder_names: dict[str, str] = {
        _normalize_name(f["name"]): f["name"]
        for f in existing_folders
    }

    total_files = sum(len(ids) for ids in groups.values() if ids)
    total_groups = sum(1 for ids in groups.values() if ids)
    _emit({
        "type": "start",
        "total_files": total_files,
        "total_groups": total_groups,
    })

    files_completed = 0
    all_watched: list[dict[str, str]] = []

    for athlete_name, file_ids in groups.items():
        if not file_ids:
            continue

        norm = _normalize_name(athlete_name)
        folder_id = folder_lookup.get(norm)


        if not folder_id:
            try:
                created = client.create_folder(athlete_name, root_folder_id, db=db)
                folder_id = created["id"]
                folder_lookup[norm] = folder_id
                folder_names[norm] = athlete_name
                result.folders_created.append({
                    "name": athlete_name,
                    "id": folder_id,
                })
                _emit({
                    "type": "folder_created",
                    "name": athlete_name,
                    "id": folder_id,
                })
            except Exception as e:
                result.errors.append(f"Failed to create folder '{athlete_name}': {e}")
                logger.error("Failed to create folder '%s': %s", athlete_name, e)
                _emit({
                    "type": "folder_failed",
                    "name": athlete_name,
                    "error": str(e),
                })
                continue


        for file_id in file_ids:
            try:
                client.move_file(file_id, folder_id, db=db)
                result.files_moved += 1
                files_completed += 1
                _emit({
                    "type": "file_moved",
                    "file_id": file_id,
                    "athlete_name": athlete_name,
                    "completed": files_completed,
                    "total": total_files,
                })
            except Exception as e:
                files_completed += 1
                result.errors.append(f"Failed to move file {file_id}: {e}")
                logger.error("Failed to move file %s to folder '%s': %s",
                             file_id, athlete_name, e)
                _emit({
                    "type": "move_failed",
                    "file_id": file_id,
                    "athlete_name": athlete_name,
                    "completed": files_completed,
                    "total": total_files,
                    "error": str(e),
                })


        all_watched.append({"id": folder_id, "name": folder_names.get(norm, athlete_name)})


    for f in existing_folders:
        norm = _normalize_name(f["name"])
        if norm not in {_normalize_name(w["name"]) for w in all_watched}:
            all_watched.append({"id": f["id"], "name": f["name"]})


    if auto_watch and all_watched:

        existing_watched = client.get_watched_folders(db=db)


        adding_named = any(w.get("id") and w["id"] != "root" for w in all_watched)
        if adding_named:
            existing_watched = [w for w in existing_watched if w.get("id") != "root"]
        existing_ids = {w["id"] for w in existing_watched}
        for w in all_watched:
            if w["id"] not in existing_ids:
                existing_watched.append(w)
        client.set_watched_folders(existing_watched, db=db)
        result.watched_folders_set = len(existing_watched)

    return result
