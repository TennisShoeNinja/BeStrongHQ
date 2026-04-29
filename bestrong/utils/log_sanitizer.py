"""Sanitize values before writing them to logs.

Prevents log injection (newline/carriage-return smuggling) and reduces
PII exposure by masking sensitive values.
"""

from __future__ import annotations


def sanitize(value: str, max_length: int = 200) -> str:
    """Strip control characters and truncate for safe log output."""
    if not isinstance(value, str):
        value = str(value)

    value = value.replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
    if len(value) > max_length:
        value = value[:max_length] + "..."
    return value


def mask_email(email: str) -> str:
    """Mask an email for logging: 'user@example.com' -> 'u***@example.com'."""
    if not email or "@" not in email:
        return "***"
    local, domain = email.rsplit("@", 1)
    if len(local) <= 1:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


def mask_id(value: str) -> str:
    """Show only the last 4 characters of an ID."""
    value = str(value)
    if len(value) <= 4:
        return "***"
    return f"***{value[-4:]}"
