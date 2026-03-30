from __future__ import annotations

import logging
from typing import Any

from ai import AIServiceError, send_structured_chat_message
from db import KanbanRepository, NotFoundError, ValidationError

logger = logging.getLogger(__name__)


def run_chat_turn(
    repository: KanbanRepository,
    username: str,
    message: str,
    conversation_history: list[dict[str, str]],
) -> dict[str, object]:
    board_context = repository.get_ai_board_context(username)
    ai_response = send_structured_chat_message(
        board_context=board_context,
        conversation_history=conversation_history,
        user_message=message,
    )
    response: dict[str, Any] = {
        "assistant_message": ai_response.assistant_message,
        "kanban_actions": [
            action.model_dump(exclude_none=True) for action in ai_response.kanban_actions
        ],
    }

    if not ai_response.kanban_actions:
        return response

    try:
        updated_board = repository.apply_ai_actions(
            username,
            [action.model_dump(exclude_none=True) for action in ai_response.kanban_actions],
        )
    except (NotFoundError, ValidationError) as error:
        raise AIServiceError(
            status_code=502,
            error="ai_action_invalid",
            details=str(error),
        ) from error
    except Exception as error:
        logger.error("Unexpected error applying AI actions: %s", error)
        raise AIServiceError(
            status_code=502,
            error="ai_action_failed",
            details="An unexpected error occurred while applying board changes.",
        ) from error

    response["board"] = updated_board
    return response
