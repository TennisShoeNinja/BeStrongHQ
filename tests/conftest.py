from __future__ import annotations

import pytest


@pytest.fixture(scope="session", autouse=True)
def writable_default_db(tmp_path_factory):
    patch = pytest.MonkeyPatch()
    default_db = tmp_path_factory.mktemp("default_db") / "bestrong.db"
    patch.setenv("BESTRONG_DB_PATH", str(default_db))

    from bestrong.models import database

    database._default_db_path = None
    yield
    database._default_db_path = None
    patch.undo()
