import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Set required env vars before importing application modules
os.environ.setdefault("PM_USERNAME", "user")
os.environ.setdefault("PM_PASSWORD", "password")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-do-not-use-in-production")

import sys
sys.path.append(str(Path(__file__).resolve().parents[1]))

from db import KanbanRepository, init_db
from main import app


@pytest.fixture
def db_path(tmp_path: Path) -> str:
    return str(tmp_path / "pm-test.sqlite3")


@pytest.fixture
def client(db_path: str) -> TestClient:
    app.state.db_path = db_path
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def repository(db_path: str) -> KanbanRepository:
    init_db(db_path)
    return KanbanRepository(db_path)
