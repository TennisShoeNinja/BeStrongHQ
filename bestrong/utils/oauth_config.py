"""Google OAuth client credential lookup.

A single OAuth consent screen can mix high-privilege scopes (full Drive)
with basic identity scopes (email/profile), but Google then treats the
whole app as "sensitive" — triggering the restricted-scope review path.
Operators who want the identity flow to stay on the non-restricted path
can split login and Drive access into two separate OAuth clients (two
GCP projects, two consent screens, two sets of credentials) and point
each flow at the appropriate client.

Self-hosted installs don't need the split — one client with all scopes
in Testing mode is perfectly fine for personal use. The helper falls
back to the unified ``GOOGLE_CLIENT_ID`` / ``GOOGLE_CLIENT_SECRET`` pair
when the split-specific vars aren't set, so existing ``.env`` files keep
working unchanged.

Purposes:
    ``login``  — OAuth for identity (openid, email, profile)
    ``drive``  — OAuth for Google Drive access
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

OAuthPurpose = Literal["login", "drive"]


_LEGACY_CREDENTIALS_PATH = Path.home() / ".bestrong" / "gdrive" / "credentials.json"


def get_oauth_client(purpose: OAuthPurpose) -> tuple[str, str]:
    """Return ``(client_id, client_secret)`` for the requested OAuth purpose.

    Resolution order:
        1. Purpose-specific env vars (``GOOGLE_LOGIN_CLIENT_ID`` /
           ``GOOGLE_LOGIN_CLIENT_SECRET`` for ``login``; ``GOOGLE_DRIVE_*``
           for ``drive``). Used together — a partial set is ignored.
        2. Unified env vars (``GOOGLE_CLIENT_ID`` / ``GOOGLE_CLIENT_SECRET``).
        3. Legacy ``~/.bestrong/gdrive/credentials.json`` (Desktop client).

    Returns empty strings for anything not found — callers decide whether
    a missing credential is a hard error (cloud) or a "not configured yet"
    state (local dev before OAuth is set up).
    """
    prefix = f"GOOGLE_{purpose.upper()}_"
    specific_id = os.environ.get(f"{prefix}CLIENT_ID", "").strip()
    specific_secret = os.environ.get(f"{prefix}CLIENT_SECRET", "").strip()
    if specific_id and specific_secret:
        return specific_id, specific_secret

    unified_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    unified_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    if unified_id and unified_secret:
        return unified_id, unified_secret

    legacy_id, legacy_secret = _read_legacy_credentials()
    return (unified_id or legacy_id, unified_secret or legacy_secret)


def _read_legacy_credentials() -> tuple[str, str]:
    """Pull client_id/secret from the optional credentials.json fallback."""
    if not _LEGACY_CREDENTIALS_PATH.exists():
        return "", ""
    try:
        data = json.loads(_LEGACY_CREDENTIALS_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return "", ""
    section = data.get("web", data.get("installed", {}))
    return section.get("client_id", ""), section.get("client_secret", "")
