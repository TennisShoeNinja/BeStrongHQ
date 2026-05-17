"""Optional registry for external integration overlays.

Public installs do not include an optional integration package, so lookups
degrade to ``None`` or an empty list. When present, the overlay registers hooks
and routers outward into this module as an import side effect. That inversion of
control keeps the core app unaware of integration internals.
"""

from __future__ import annotations

import importlib
import os
from collections.abc import Callable
from typing import Any

PLUGIN_PACKAGE_NAME: str = os.environ.get("PLUGIN_PACKAGE_NAME", "bestrong_cloud")

_hooks: dict[str, Callable[..., Any]] = {}
_routers: list[Any] = []
_loaded = False


def register_hook(name: str, fn: Callable[..., Any]) -> None:
    _hooks[name] = fn


def get_hook(name: str) -> Callable[..., Any] | None:
    load_plugins()
    return _hooks.get(name)


def register_router(router: Any) -> None:
    _routers.append(router)


def iter_routers() -> list[Any]:
    load_plugins()
    return list(_routers)


def load_plugins() -> None:
    """Import the optional overlay registration module if it is available."""
    global _loaded

    if _loaded:
        return

    try:
        importlib.import_module(f"{PLUGIN_PACKAGE_NAME}._plugins")
    except ImportError:
        return

    _loaded = True
