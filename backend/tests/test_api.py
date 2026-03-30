from fastapi.testclient import TestClient

from ai import AIServiceError
from chat_contract import (
    CreateCardAction,
    RenameColumnAction,
    StructuredChatResponse,
)


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_hello(client: TestClient) -> None:
    response = client.get("/api/hello")
    assert response.status_code == 200
    assert response.json() == {"message": "hello from backend"}


def test_login_sets_session_cookie(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "username": "user"}
    assert "session" in response.cookies

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    assert session_response.json() == {"authenticated": True, "username": "user"}


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password."}


def test_protected_route_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/auth/protected")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_logout_clears_session(client: TestClient) -> None:
    login(client)

    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "username": None}

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    assert session_response.json() == {"authenticated": False, "username": None}


def test_get_board_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/board")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_get_board_returns_seeded_columns_for_authenticated_user(
    client: TestClient,
) -> None:
    login(client)

    response = client.get("/api/board")
    assert response.status_code == 200

    board = response.json()
    assert board["name"] == "My Board"
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert all(column["cards"] == [] for column in board["columns"])


def test_chat_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "2+2"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_chat_rejects_empty_message(client: TestClient) -> None:
    login(client)

    response = client.post("/api/chat", json={"message": "   "})
    assert response.status_code == 400
    assert response.json() == {
        "error": "invalid_request",
        "details": "Message is required.",
    }


def test_chat_reports_missing_openrouter_key(
    client: TestClient, monkeypatch
) -> None:
    login(client)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post("/api/chat", json={"message": "2+2"})
    assert response.status_code == 503
    assert response.json() == {
        "error": "ai_not_configured",
        "details": "OPENROUTER_API_KEY is not configured.",
    }


def test_chat_returns_message_only_response(client: TestClient, monkeypatch) -> None:
    login(client)

    def fake_chat_turn(*args, **kwargs) -> dict[str, object]:
        return {"assistant_message": "No board changes needed.", "kanban_actions": []}

    monkeypatch.setattr("main.run_chat_turn", fake_chat_turn)

    response = client.post("/api/chat", json={"message": "Summarize the board"})
    assert response.status_code == 200
    assert response.json() == {
        "assistant_message": "No board changes needed.",
        "kanban_actions": [],
    }


def test_chat_applies_single_ai_action(client: TestClient, monkeypatch) -> None:
    login(client)
    board = client.get("/api/board").json()
    backlog_id = board["columns"][0]["id"]

    def fake_structured_response(**kwargs) -> StructuredChatResponse:
        return StructuredChatResponse(
            assistant_message="I added a card.",
            kanban_actions=[
                CreateCardAction(
                    type="create_card",
                    column_id=backlog_id,
                    title="AI task",
                    details="Created by assistant.",
                )
            ],
        )

    monkeypatch.setattr("chat_service.send_structured_chat_message", fake_structured_response)

    response = client.post("/api/chat", json={"message": "Add a task"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["assistant_message"] == "I added a card."
    assert payload["kanban_actions"] == [
        {
            "type": "create_card",
            "column_id": backlog_id,
            "title": "AI task",
            "details": "Created by assistant.",
        }
    ]
    assert payload["board"]["columns"][0]["cards"][0]["title"] == "AI task"

    refreshed_board = client.get("/api/board").json()
    assert refreshed_board["columns"][0]["cards"][0]["title"] == "AI task"


def test_chat_applies_multiple_ai_actions(client: TestClient, monkeypatch) -> None:
    login(client)
    board = client.get("/api/board").json()
    backlog_id = board["columns"][0]["id"]

    def fake_structured_response(**kwargs) -> StructuredChatResponse:
        return StructuredChatResponse(
            assistant_message="I renamed the column and added a card.",
            kanban_actions=[
                RenameColumnAction(
                    type="rename_column",
                    column_id=backlog_id,
                    title="Ideas",
                ),
                CreateCardAction(
                    type="create_card",
                    column_id=backlog_id,
                    title="Explore AI workflow",
                    details="Next step",
                ),
            ],
        )

    monkeypatch.setattr("chat_service.send_structured_chat_message", fake_structured_response)

    response = client.post("/api/chat", json={"message": "Set up next work"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["board"]["columns"][0]["title"] == "Ideas"
    assert payload["board"]["columns"][0]["cards"][0]["title"] == "Explore AI workflow"


def test_chat_rejects_invalid_ai_action_without_mutating_board(
    client: TestClient, monkeypatch
) -> None:
    login(client)
    board_before = client.get("/api/board").json()

    def fake_structured_response(**kwargs) -> StructuredChatResponse:
        return StructuredChatResponse(
            assistant_message="I deleted the missing card.",
            kanban_actions=[{"type": "delete_card", "card_id": 999999}],
        )

    monkeypatch.setattr("chat_service.send_structured_chat_message", fake_structured_response)

    response = client.post("/api/chat", json={"message": "Delete that missing card"})
    assert response.status_code == 502
    assert response.json() == {
        "error": "ai_action_invalid",
        "details": "Card not found.",
    }
    assert client.get("/api/board").json() == board_before


def test_chat_includes_session_history_and_resets_on_logout(
    client: TestClient, monkeypatch
) -> None:
    login(client)
    captured_histories: list[list[dict[str, str]]] = []

    def fake_structured_response(**kwargs) -> StructuredChatResponse:
        captured_histories.append(
            [dict(entry) for entry in kwargs["conversation_history"]]
        )
        return StructuredChatResponse(
            assistant_message="Acknowledged.",
            kanban_actions=[],
        )

    monkeypatch.setattr("chat_service.send_structured_chat_message", fake_structured_response)

    first_response = client.post("/api/chat", json={"message": "First request"})
    assert first_response.status_code == 200

    second_response = client.post("/api/chat", json={"message": "Second request"})
    assert second_response.status_code == 200

    assert captured_histories[0] == []
    assert captured_histories[1] == [
        {"role": "user", "content": "First request"},
        {"role": "assistant", "content": "Acknowledged."},
    ]

    client.post("/api/auth/logout")
    login(client)
    third_response = client.post("/api/chat", json={"message": "After relogin"})
    assert third_response.status_code == 200
    assert captured_histories[2] == []


def test_board_mutation_endpoints_update_cards_and_columns(client: TestClient) -> None:
    login(client)

    board = client.get("/api/board").json()
    first_column_id = board["columns"][0]["id"]
    second_column_id = board["columns"][1]["id"]

    rename_response = client.patch(
        f"/api/columns/{first_column_id}",
        json={"title": "Ideas"},
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["columns"][0]["title"] == "Ideas"

    create_response = client.post(
        "/api/cards",
        json={
            "column_id": first_column_id,
            "title": "Ship backend API",
            "details": "Implement persistence endpoints.",
        },
    )
    assert create_response.status_code == 200
    created_board = create_response.json()
    created_card = created_board["columns"][0]["cards"][0]
    assert created_card["title"] == "Ship backend API"

    update_response = client.patch(
        f"/api/cards/{created_card['id']}",
        json={"title": "Ship Kanban API", "details": "Done soon."},
    )
    assert update_response.status_code == 200
    updated_card = update_response.json()["columns"][0]["cards"][0]
    assert updated_card["title"] == "Ship Kanban API"
    assert updated_card["details"] == "Done soon."

    move_response = client.patch(
        f"/api/cards/{created_card['id']}/move",
        json={"column_id": second_column_id, "position": 0},
    )
    assert move_response.status_code == 200
    moved_board = move_response.json()
    assert moved_board["columns"][0]["cards"] == []
    assert moved_board["columns"][1]["cards"][0]["id"] == created_card["id"]

    delete_response = client.delete(f"/api/cards/{created_card['id']}")
    assert delete_response.status_code == 200
    deleted_board = delete_response.json()
    assert deleted_board["columns"][1]["cards"] == []


def test_move_endpoint_handles_reorder_and_non_empty_target_columns(client: TestClient) -> None:
    login(client)

    board = client.get("/api/board").json()
    first_column_id = board["columns"][0]["id"]
    second_column_id = board["columns"][1]["id"]

    first_create = client.post(
        "/api/cards",
        json={"column_id": first_column_id, "title": "First", "details": ""},
    )
    second_create = client.post(
        "/api/cards",
        json={"column_id": first_column_id, "title": "Second", "details": ""},
    )
    third_create = client.post(
        "/api/cards",
        json={"column_id": second_column_id, "title": "Target", "details": ""},
    )

    first_card_id = first_create.json()["columns"][0]["cards"][0]["id"]
    second_card_id = second_create.json()["columns"][0]["cards"][1]["id"]
    target_card_id = third_create.json()["columns"][1]["cards"][0]["id"]

    reorder_response = client.patch(
        f"/api/cards/{second_card_id}/move",
        json={"column_id": first_column_id, "position": 0},
    )
    assert reorder_response.status_code == 200
    reordered_cards = reorder_response.json()["columns"][0]["cards"]
    assert [card["id"] for card in reordered_cards] == [second_card_id, first_card_id]

    cross_column_response = client.patch(
        f"/api/cards/{first_card_id}/move",
        json={"column_id": second_column_id, "position": 0},
    )
    assert cross_column_response.status_code == 200
    target_cards = cross_column_response.json()["columns"][1]["cards"]
    assert [card["id"] for card in target_cards] == [first_card_id, target_card_id]


def test_move_endpoint_handles_drop_to_end_of_non_empty_column(client: TestClient) -> None:
    login(client)

    board = client.get("/api/board").json()
    first_column_id = board["columns"][0]["id"]
    second_column_id = board["columns"][1]["id"]

    first_create = client.post(
        "/api/cards",
        json={"column_id": first_column_id, "title": "To end", "details": ""},
    )
    client.post(
        "/api/cards",
        json={"column_id": second_column_id, "title": "Existing one", "details": ""},
    )
    third_create = client.post(
        "/api/cards",
        json={"column_id": second_column_id, "title": "Existing two", "details": ""},
    )

    moving_card_id = first_create.json()["columns"][0]["cards"][0]["id"]
    destination_position = len(third_create.json()["columns"][1]["cards"])

    response = client.patch(
        f"/api/cards/{moving_card_id}/move",
        json={"column_id": second_column_id, "position": destination_position},
    )
    assert response.status_code == 200
    assert [card["title"] for card in response.json()["columns"][1]["cards"]] == [
        "Existing one",
        "Existing two",
        "To end",
    ]


def test_board_mutation_validation_and_not_found_paths(client: TestClient) -> None:
    login(client)

    board = client.get("/api/board").json()
    first_column_id = board["columns"][0]["id"]

    empty_title_response = client.patch(
        f"/api/columns/{first_column_id}",
        json={"title": "   "},
    )
    assert empty_title_response.status_code == 400
    assert empty_title_response.json() == {"detail": "Column title is required."}

    missing_column_response = client.post(
        "/api/cards",
        json={"column_id": 999999, "title": "Missing", "details": ""},
    )
    assert missing_column_response.status_code == 404
    assert missing_column_response.json() == {"detail": "Column not found."}

    bad_update_response = client.patch(
        "/api/cards/999999",
        json={"title": "No card"},
    )
    assert bad_update_response.status_code == 404
    assert bad_update_response.json() == {"detail": "Card not found."}

    bad_move_response = client.patch(
        "/api/cards/999999/move",
        json={"column_id": first_column_id, "position": 0},
    )
    assert bad_move_response.status_code == 404
    assert bad_move_response.json() == {"detail": "Card not found."}
