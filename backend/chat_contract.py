from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CreateCardAction(BaseModel):
    type: Literal["create_card"]
    column_id: int
    title: str
    details: str = ""
    position: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Card title is required.")
        return cleaned


class EditCardAction(BaseModel):
    type: Literal["edit_card"]
    card_id: int
    title: str | None = None
    details: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Card title is required.")
        return cleaned

    @model_validator(mode="after")
    def validate_payload(self) -> "EditCardAction":
        if self.title is None and self.details is None:
            raise ValueError("edit_card must include title or details.")
        return self


class MoveCardAction(BaseModel):
    type: Literal["move_card"]
    card_id: int
    column_id: int
    position: int = Field(ge=0)


class DeleteCardAction(BaseModel):
    type: Literal["delete_card"]
    card_id: int


class RenameColumnAction(BaseModel):
    type: Literal["rename_column"]
    column_id: int
    title: str

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Column title is required.")
        return cleaned


KanbanAction = Annotated[
    CreateCardAction
    | EditCardAction
    | MoveCardAction
    | DeleteCardAction
    | RenameColumnAction,
    Field(discriminator="type"),
]


class StructuredChatResponse(BaseModel):
    # Ignore extra fields the model may return (e.g. "thoughts", "reasoning").
    model_config = ConfigDict(extra="ignore")

    assistant_message: str
    kanban_actions: list[KanbanAction] = Field(default_factory=list)

    @field_validator("assistant_message")
    @classmethod
    def validate_assistant_message(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("assistant_message is required.")
        return cleaned

    @field_validator("kanban_actions", mode="before")
    @classmethod
    def coerce_null_to_empty_list(cls, value: object) -> object:
        # Some models return null instead of [] when there are no actions.
        return value if value is not None else []


def structured_chat_response_schema() -> dict[str, object]:
    return {
        "name": "kanban_chat_response",
        "strict": True,
        "schema": StructuredChatResponse.model_json_schema(),
    }
