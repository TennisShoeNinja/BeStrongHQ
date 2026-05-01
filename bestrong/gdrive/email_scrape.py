"""Resolve athlete emails from Google Drive sharing permissions.

When a coach shares a program sheet with an athlete via Drive, the file's
permission list contains the athlete's email. This module extracts it and
writes it to the matching Athlete row.

Pure resolution lives in ``resolve_email``; I/O lives in ``scrape_for_athlete``.
"""

from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from ..models.orm import Athlete
from ..utils.log_sanitizer import sanitize
from . import client

logger = logging.getLogger(__name__)


def resolve_email(candidates: list[dict], coach_email: str | None) -> str | None:
    """Pick the athlete's email from a Drive permission list.

    Excludes the connected coach. Returns the email when exactly one
    non-coach candidate remains; returns None on zero or multiple
    matches so the caller leaves the field blank rather than guess.
    """
    coach = (coach_email or "").lower()
    remaining = [
        c["email"] for c in candidates
        if c.get("email") and c["email"].lower() != coach
    ]
    if len(remaining) == 1:
        return remaining[0]
    return None


def find_athlete_by_folder(db: DBSession, folder_name: str) -> Athlete | None:
    """Locate an Athlete row from a Drive folder name.

    Tries exact case-insensitive match first, then a prefix match so a
    folder named "Joshua" resolves to "Joshua Onadeko". Returns None
    when no single match is found, so the caller skips rather than
    attaching to the wrong row.
    """
    clean = folder_name.strip()
    if not clean:
        return None

    exact = db.query(Athlete).filter(
        func.lower(Athlete.name) == clean.lower()
    ).first()
    if exact:
        return exact

    prefix_matches = (
        db.query(Athlete)
        .filter(Athlete.name.ilike(f"{clean}%"))
        .limit(2)
        .all()
    )
    if len(prefix_matches) == 1:
        return prefix_matches[0]
    return None


def scrape_for_athlete(
    db: DBSession,
    athlete: Athlete,
    file_ids: list[str],
    coach_email: str | None,
    db_path: Path | None = None,
    force: bool = False,
) -> bool:
    """Read sharing on the given files and set ``athlete.email`` if missing.

    Walks the file IDs in order, returning as soon as a single non-coach
    email resolves. No-ops when the athlete already has an email
    (unless ``force=True``), when no file resolves, or when the
    resolution is ambiguous. With ``force=True``, only overwrites when
    a new email actually resolves; never blanks an existing one.
    """
    if athlete.email and not force:
        return False
    for file_id in file_ids:
        if not file_id:
            continue
        candidates = client.get_shared_emails(file_id, db=db, db_path=db_path)
        if not candidates:
            continue
        email = resolve_email(candidates, coach_email)
        if email and email != athlete.email:
            athlete.email = email
            logger.info(
                "Resolved email for %s from Drive sharing",
                sanitize(athlete.name),
            )
            return True
    return False
