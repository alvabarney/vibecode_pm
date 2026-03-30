import os
from pathlib import Path
import sys

import pytest

os.environ.setdefault("PM_USERNAME", "user")
os.environ.setdefault("PM_PASSWORD", "password")

sys.path.append(str(Path(__file__).resolve().parents[1]))

from auth import get_authenticated_user, validate_credentials


def test_validate_credentials_accepts_dummy_login() -> None:
    assert validate_credentials("user", "password") is True


def test_validate_credentials_rejects_bad_login() -> None:
    assert validate_credentials("user", "wrong") is False


def test_validate_credentials_raises_if_env_vars_missing(monkeypatch) -> None:
    monkeypatch.delenv("PM_USERNAME", raising=False)
    monkeypatch.delenv("PM_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="PM_USERNAME and PM_PASSWORD"):
        validate_credentials("user", "password")


def test_get_authenticated_user_reads_session_value() -> None:
    assert get_authenticated_user({"user": "user"}) == "user"
    assert get_authenticated_user({}) is None
