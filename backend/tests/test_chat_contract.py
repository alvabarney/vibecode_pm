from pathlib import Path
import sys

import pytest
from pydantic import ValidationError

sys.path.append(str(Path(__file__).resolve().parents[1]))

from chat_contract import StructuredChatResponse


def test_structured_chat_response_accepts_valid_payload() -> None:
    response = StructuredChatResponse.model_validate(
        {
            "assistant_message": "I updated the board.",
            "kanban_actions": [
                {
                    "type": "create_card",
                    "column_id": 10,
                    "title": "New task",
                    "details": "Created by AI",
                },
                {
                    "type": "move_card",
                    "card_id": 101,
                    "column_id": 11,
                    "position": 0,
                },
            ],
        }
    )

    assert response.assistant_message == "I updated the board."
    assert len(response.kanban_actions) == 2


def test_structured_chat_response_rejects_unknown_action_type() -> None:
    with pytest.raises(ValidationError):
        StructuredChatResponse.model_validate(
            {
                "assistant_message": "Invalid action.",
                "kanban_actions": [{"type": "archive_card", "card_id": 101}],
            }
        )


def test_structured_chat_response_rejects_invalid_action_payload() -> None:
    with pytest.raises(ValidationError):
        StructuredChatResponse.model_validate(
            {
                "assistant_message": "Missing required fields.",
                "kanban_actions": [{"type": "create_card", "column_id": 10}],
            }
        )


def test_structured_chat_response_requires_non_empty_assistant_message() -> None:
    with pytest.raises(ValidationError):
        StructuredChatResponse.model_validate(
            {"assistant_message": "   ", "kanban_actions": []}
        )
