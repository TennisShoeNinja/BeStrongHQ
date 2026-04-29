"""Structured security audit logging.

All security-relevant events (login, logout, user management, settings
changes, access denials) are logged through this module so they can be
reviewed, forwarded to a SIEM, or used for incident investigation.

Events are written to a dedicated ``bestrong.security`` Python logger at
INFO level (denials at WARNING).  The format is a structured key=value
line that is easy to parse with log aggregation tools.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime

from fastapi import Request

_logger = logging.getLogger("bestrong.security")


_logger.setLevel(logging.INFO)
_logger.propagate = False
if not any(isinstance(h, logging.StreamHandler) for h in _logger.handlers):
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setLevel(logging.INFO)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)


def _client_ip(request: Request | None) -> str:
    """Best-effort client IP from the request."""
    if request is None:
        return "server"
    return request.client.host if request.client else "unknown"


def security_log(
    event: str,
    *,
    actor: str = "anonymous",
    ip: str | None = None,
    request: Request | None = None,
    detail: str = "",
    level: int = logging.INFO,
) -> None:
    """Write a structured security audit log entry.

    Parameters
    ----------
    event:
        Short event identifier, e.g. ``login_success``, ``user_removed``.
    actor:
        Email of the user performing the action, or ``"anonymous"``.
    ip:
        Client IP address.  Derived from *request* when not given.
    request:
        The incoming FastAPI ``Request``; used to derive *ip* when *ip*
        is not passed explicitly.
    detail:
        Free-form extra context (keep it short and free of PII beyond
        what is strictly necessary for the audit trail).
    level:
        Python log level.  Defaults to INFO; use WARNING for access
        denials and suspicious activity.
    """
    if ip is None:
        ip = _client_ip(request)

    ts = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    parts = [
        f"ts={ts}",
        f"event={event}",
        f"actor={actor}",
        f"ip={ip}",
    ]
    if detail:
        parts.append(f"detail={detail}")

    _logger.log(level, " ".join(parts))
