import logging
import os
import json
import time
from dataclasses import dataclass
from typing import Any

import httpx

from chat_contract import StructuredChatResponse

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b:free"
MAX_OPENROUTER_ATTEMPTS = 3
OPENROUTER_TIMEOUT_BUDGET = 60.0


@dataclass
class AIServiceError(Exception):
    status_code: int
    error: str
    details: str


def send_chat_message(message: str) -> str:
    data = _post_chat_completion(
        {
            "model": OPENROUTER_MODEL,
            "messages": [{"role": "user", "content": message}],
        }
    )

    assistant_message = _extract_message_content(data)
    if not assistant_message:
        raise AIServiceError(
            status_code=502,
            error="ai_response_invalid",
            details="The AI service returned an empty response.",
        )

    return assistant_message


_SYSTEM_PROMPT = """\
You are an assistant for a Kanban board application.

You MUST respond with ONLY a valid JSON object — no prose, no markdown outside the JSON.

Required structure:
{
  "assistant_message": "<your natural-language reply to the user>",
  "kanban_actions": []
}

If you need to change the board, populate kanban_actions with one or more of these action objects:
  {"type":"create_card","column_id":<int>,"title":"<str>","details":"<str>","position":<int or omit>}
  {"type":"edit_card","card_id":<int>,"title":"<str or omit>","details":"<str or omit>"}
  {"type":"move_card","card_id":<int>,"column_id":<int>,"position":<int>}
  {"type":"delete_card","card_id":<int>}
  {"type":"rename_column","column_id":<int>,"title":"<str>"}

Rules:
- Use ONLY column_id and card_id values that appear in the board context provided below.
- Leave kanban_actions as an empty array when no board change is needed.
- Your entire response must be parseable by json.loads().\
"""


def send_structured_chat_message(
    board_context: dict[str, object],
    conversation_history: list[dict[str, str]],
    user_message: str,
) -> StructuredChatResponse:
    prompt_payload = {
        "board": board_context.get("board", board_context),
        "conversation_history": conversation_history,
        "user_message": user_message,
    }
    data = _post_chat_completion(
        {
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(prompt_payload, separators=(",", ":")),
                },
            ],
        }
    )

    raw_message = _extract_message_content(data)
    if not raw_message:
        logger.error(
            "Empty content from model. finish_reason=%s",
            _extract_finish_reason(data),
        )
        raise AIServiceError(
            status_code=502,
            error="ai_response_invalid",
            details="The AI service returned an empty response.",
        )

    json_text = _strip_code_fence(raw_message)

    try:
        payload = json.loads(json_text)
    except json.JSONDecodeError as error:
        logger.error("Model returned non-JSON content: %.200s", json_text)
        raise AIServiceError(
            status_code=502,
            error="ai_response_invalid",
            details="The AI service returned invalid JSON.",
        ) from error

    try:
        return StructuredChatResponse.model_validate(payload)
    except Exception as error:
        logger.error("Model JSON did not match schema: %.200s", json_text)
        raise AIServiceError(
            status_code=502,
            error="ai_response_invalid",
            details="The AI service returned a response that did not match the expected schema.",
        ) from error


def _post_chat_completion(payload: dict[str, object]) -> dict[str, Any]:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise AIServiceError(
            status_code=503,
            error="ai_not_configured",
            details="OPENROUTER_API_KEY is not configured.",
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    deadline = time.monotonic() + OPENROUTER_TIMEOUT_BUDGET
    response: httpx.Response | None = None

    for attempt in range(1, MAX_OPENROUTER_ATTEMPTS + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise AIServiceError(
                status_code=504,
                error="ai_timeout",
                details="Timed out waiting for a response from the AI service.",
            )
        try:
            response = httpx.post(
                OPENROUTER_URL,
                json=payload,
                headers=headers,
                timeout=min(30.0, remaining),
            )
        except httpx.TimeoutException:
            raise AIServiceError(
                status_code=504,
                error="ai_timeout",
                details="Timed out waiting for the AI service.",
            ) from None
        except httpx.HTTPError:
            raise AIServiceError(
                status_code=502,
                error="ai_connection_error",
                details="Could not reach the AI service.",
            ) from None

        if response.status_code != 429 or attempt == MAX_OPENROUTER_ATTEMPTS:
            break

        sleep_time = min(float(attempt), deadline - time.monotonic())
        if sleep_time > 0:
            time.sleep(sleep_time)

    if response is None:
        raise AIServiceError(
            status_code=503,
            error="ai_no_response",
            details="No response received from the AI service.",
        )

    if response.status_code in {401, 403}:
        logger.error(
            "OpenRouter auth error: status=%d details=%s",
            response.status_code,
            _extract_error_details(response),
        )
        raise AIServiceError(
            status_code=502,
            error="ai_auth_failed",
            details="The AI service rejected the request credentials.",
        )

    if response.status_code >= 400:
        logger.error(
            "OpenRouter request error: status=%d details=%s",
            response.status_code,
            _extract_error_details(response),
        )
        raise AIServiceError(
            status_code=502,
            error="ai_request_failed",
            details="The AI service returned an error. Please try again.",
        )

    try:
        return response.json()
    except ValueError:
        raise AIServiceError(
            status_code=502,
            error="ai_response_invalid",
            details="The AI service returned a non-JSON response.",
        ) from None


def _strip_code_fence(text: str) -> str:
    """Remove markdown code fences that some models wrap JSON in."""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        # Drop the opening fence line (``` or ```json) and the closing ```
        inner = lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        stripped = "\n".join(inner).strip()
    return stripped


def _extract_finish_reason(data: dict[str, Any]) -> str:
    try:
        return str(data["choices"][0].get("finish_reason", "unknown"))
    except (KeyError, IndexError, TypeError):
        return "unknown"


def _extract_error_details(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text.strip()

    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            metadata = error.get("metadata")
            if isinstance(metadata, dict):
                raw = metadata.get("raw")
                if isinstance(raw, str) and raw.strip():
                    return raw.strip()
            message = error.get("message")
            if isinstance(message, str):
                return message.strip()
        if isinstance(error, str):
            return error.strip()

    return ""


def _extract_message_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""

    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_chunks: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "text":
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                text_chunks.append(text.strip())
        return "\n".join(text_chunks).strip()

    return ""
