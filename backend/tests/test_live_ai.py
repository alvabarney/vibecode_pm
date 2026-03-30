import os
import re

import httpx
import pytest


def test_live_chat_connectivity() -> None:
    if os.getenv("PM_RUN_LIVE_AI_TEST") != "1":
        pytest.skip("Set PM_RUN_LIVE_AI_TEST=1 to run the live OpenRouter test.")

    base_url = os.getenv("PM_BACKEND_BASE_URL", "http://127.0.0.1:18000")

    with httpx.Client(base_url=base_url, timeout=60.0) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        assert login_response.status_code == 200, login_response.text

        response = client.post(
            "/api/chat",
            json={"message": "What is 2+2? Reply briefly."},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("assistant_message"), str)
    assert re.search(r"\b4\b", body["assistant_message"])
