"""Helpers for returning safe error responses without leaking internals."""

from __future__ import annotations

import logging

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def safe_error(exc: Exception, public_message: str, *, status_code: int = 500) -> None:
    """Log the full exception server-side, then raise HTTPException with a safe message.

    This prevents leaking filesystem paths, API keys, internal state,
    or stack traces to HTTP clients.
    """
    logger.error("Internal error (public_message=%r): %s", public_message, exc, exc_info=True)
    raise HTTPException(status_code=status_code, detail=public_message)
