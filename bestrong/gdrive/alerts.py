"""Alerts for Drive connection health events.

Currently logs only. Email/Slack delivery is Phase 2 — pick a provider
(Resend/Postmark/SendGrid) and fill in `_deliver_alert()` below. The
rest of the app calls these high-level helpers and does not need to
change when the delivery mechanism lands.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def send_connection_expired_alert(email: str, error: str) -> None:
    """Notify the coach that their Drive connection has expired.

    Triggered the first time a sync (or on-demand refresh) sees
    invalid_grant. Should not fire on every failed attempt after that —
    callers are responsible for only invoking this on the
    active -> expired transition.
    """
    subject = "Google Drive sync paused — reconnect required"
    body = (
        f"Your Google Drive connection for BeStrong has expired and background\n"
        f"sync is paused. Open the app and click \"Reconnect Google Drive\" to\n"
        f"resume.\n\n"
        f"Account: {email}\n"
        f"Detail: {error}\n"
    )
    _deliver_alert(to=email, subject=subject, body=body)


def _deliver_alert(to: str, subject: str, body: str) -> None:
    """Dispatch an alert. Currently a log-only stub.

    TODO(phase-2): wire to an email provider. Candidates:
      - Resend (simplest API, generous free tier)
      - Postmark (best deliverability for transactional)
      - SendGrid (ubiquitous, more setup)
    Config should live in .env (ALERT_FROM, provider API key) and this
    function should short-circuit with a warning if unconfigured.
    """
    logger.warning(
        "ALERT (not yet delivered) to=%s subject=%r body=%r",
        to,
        subject,
        body,
    )
