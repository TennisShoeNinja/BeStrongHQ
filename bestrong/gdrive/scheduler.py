"""Background scheduler for automatic Google Drive sync."""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from . import client
from .sync import sync_folder

logger = logging.getLogger(__name__)


_AUTH_ERROR_MARKERS = (
    "invalid_grant",
    "invalid grant",
    "token has been expired or revoked",
    "unauthorized_client",
    "invalid_client",
    "not authenticated with google drive",
)


def _looks_like_auth_error(exc: Exception) -> bool:
    """Return True if *exc* is almost certainly an OAuth/auth failure."""
    msg = str(exc).lower()
    return any(marker in msg for marker in _AUTH_ERROR_MARKERS)


_schedulers: dict[str, SyncScheduler] = {}
_lock = threading.Lock()


def _scheduler_key(db_path: Path | str | None = None) -> str:
    if db_path is None:
        return "default"
    return str(Path(db_path))


class SyncScheduler:
    """Runs Google Drive sync on a configurable interval in a background thread."""

    def __init__(self, db_path: Path | str | None = None):
        self._db_path = Path(db_path) if db_path is not None else None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._interval_minutes: int = 0
        self._last_run: str | None = None
        self._last_status: str | None = None
        self._last_error: str | None = None
        self._running = False


        self._load_settings()

    def _load_settings(self):
        """Load schedule config from instance-scoped settings."""
        try:
            self._interval_minutes = int(
                client._get_setting_value(
                    "gdrive_sync_interval_minutes", db_path=self._db_path
                )
                or 0
            )
            self._last_run = client._get_setting_value(
                "gdrive_sync_last_auto_run", db_path=self._db_path
            )
            self._last_status = client._get_setting_value(
                "gdrive_sync_last_auto_status", db_path=self._db_path
            )
        except Exception:
            pass

    def _save_settings(self):
        """Persist schedule config to instance-scoped settings."""
        try:
            client._set_setting_value(
                "gdrive_sync_interval_minutes",
                str(self._interval_minutes),
                db_path=self._db_path,
            )
            client._set_setting_value(
                "gdrive_sync_last_auto_run", self._last_run, db_path=self._db_path
            )
            client._set_setting_value(
                "gdrive_sync_last_auto_status",
                self._last_status,
                db_path=self._db_path,
            )
        except Exception as e:
            logger.warning("Failed to save scheduler settings: %s", e)

    def _run_loop(self):
        """Background thread loop."""
        logger.info(
            "Sync scheduler started (db=%s, every %d minutes)",
            self._db_path or "default",
            self._interval_minutes,
        )
        while not self._stop_event.is_set():

            wait_seconds = self._interval_minutes * 60
            elapsed = 0
            while elapsed < wait_seconds and not self._stop_event.is_set():
                time.sleep(min(10, wait_seconds - elapsed))
                elapsed += 10

            if self._stop_event.is_set():
                break

            self._do_sync()

        logger.info("Sync scheduler stopped (db=%s)", self._db_path or "default")

    def _do_sync(self):
        """Execute one sync run."""
        self._running = True
        now = datetime.now(timezone.utc).isoformat()
        self._last_run = now
        logger.info("Auto-sync starting at %s", now)

        try:


            health = client.get_connection_health(db_path=self._db_path)
            if health["status"] == "expired":
                self._last_status = "Skipped: Drive connection expired (reconnect required)"
                logger.info("Auto-sync skipped — connection expired")
                return
            if health["status"] == "disconnected":
                self._last_status = "Skipped: Drive not connected"
                return

            result = sync_folder(db_path=self._db_path)
            summary = (
                f"Found {result.total}, imported {len(result.imported)}, "
                f"skipped {len(result.skipped)}, errors {len(result.errors)}"
            )
            self._last_status = summary
            client.mark_sync_success(db_path=self._db_path)
            logger.info("Auto-sync complete: %s", summary)
        except Exception as e:
            msg = str(e)
            self._last_status = f"Error: {msg}"
            self._last_error = msg
            if _looks_like_auth_error(e):
                logger.error("Auto-sync auth failure (flagging as expired): %s", e)
                client.mark_sync_auth_failure(msg, db_path=self._db_path)
            else:
                logger.error("Auto-sync failed: %s", e)
        finally:
            self._running = False
            self._save_settings()

    @property
    def is_active(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def status(self) -> dict:
        return {
            "enabled": self._interval_minutes > 0 and self.is_active,
            "interval_minutes": self._interval_minutes,
            "last_run": self._last_run,
            "last_status": self._last_status,
            "running_now": self._running,
        }

    def set_interval(self, minutes: int):
        """Update the sync interval. 0 = disable."""
        was_active = self.is_active
        if was_active:
            self.stop()

        self._interval_minutes = minutes
        self._save_settings()

        if minutes > 0:
            self.start()

    def start(self):
        """Start the scheduler thread if an interval is configured."""
        if self._interval_minutes <= 0:
            return
        if self.is_active:
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name=f"gdrive-sync-scheduler:{_scheduler_key(self._db_path)}",
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        """Stop the scheduler thread."""
        if self._thread is not None:
            self._stop_event.set()
            self._thread.join(timeout=15)
            self._thread = None


def get_scheduler(db_path: Path | str | None = None) -> SyncScheduler:
    """Get or create the scheduler for a specific instance DB."""
    key = _scheduler_key(db_path)
    with _lock:
        if key not in _schedulers:
            _schedulers[key] = SyncScheduler(db_path=db_path)
        return _schedulers[key]


def start_scheduler():
    """Initialize and start schedulers from stored config on app startup."""
    mode = os.environ.get("DEPLOYMENT_MODE", "local").lower().strip()

    if mode == "cloud":
        try:
            from bestrong_cloud.registry import list_active_subdomains, lookup_tenant
        except ImportError:
            logger.info("Multi-instance scheduler startup skipped — no registry available")
            return

        started = 0
        for subdomain in list_active_subdomains():
            record = lookup_tenant(subdomain)
            if record is None:
                continue
            scheduler = get_scheduler(record.db_path)
            if scheduler._interval_minutes > 0:
                scheduler.start()
                started += 1
        logger.info("Auto-sync schedulers started for %d instance(s)", started)
        return

    scheduler = get_scheduler()
    if scheduler._interval_minutes > 0:
        scheduler.start()
        logger.info(
            "Auto-sync scheduler started: every %d minutes",
            scheduler._interval_minutes,
        )
    else:
        logger.info("Auto-sync scheduler not started (no interval configured)")
