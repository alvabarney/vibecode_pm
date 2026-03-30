import logging
import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Path, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse

from ai import AIServiceError
from auth import SESSION_USER_KEY, get_authenticated_user, validate_credentials
from chat_service import run_chat_turn
from db import (
    KanbanRepository,
    NotFoundError,
    ValidationError,
    get_default_db_path,
    init_db,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db(app.state.db_path)
    app.state.chat_histories = {}
    yield


app = FastAPI(title="PM MVP Backend", lifespan=lifespan)

_session_secret = os.getenv("SESSION_SECRET")
if not _session_secret:
    _session_secret = secrets.token_hex(32)
    logger.warning(
        "SESSION_SECRET not set — using a transient random secret. "
        "Sessions will not persist across restarts."
    )

app.add_middleware(
    SessionMiddleware,
    secret_key=_session_secret,
    same_site="lax",
    https_only=os.getenv("HTTPS_ONLY", "false").lower() == "true",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


class LoginRequest(BaseModel):
    username: str
    password: str


class RenameColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    column_id: int
    title: str
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str | None = None
    details: str | None = None


class MoveCardRequest(BaseModel):
    column_id: int
    position: int


class ChatRequest(BaseModel):
    message: str


SESSION_CHAT_HISTORY_KEY = "chat_history_id"


def require_authenticated_user(request: Request) -> str:
    user = get_authenticated_user(request.session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return user


def get_repository(request: Request) -> KanbanRepository:
    return KanbanRepository(request.app.state.db_path)


def reset_chat_history(request: Request) -> None:
    history_id = request.session.get(SESSION_CHAT_HISTORY_KEY)
    if isinstance(history_id, str):
        request.app.state.chat_histories.pop(history_id, None)


def ensure_chat_history(request: Request) -> list[dict[str, str]]:
    history_id = request.session.get(SESSION_CHAT_HISTORY_KEY)
    if not isinstance(history_id, str) or not history_id:
        history_id = uuid4().hex
        request.session[SESSION_CHAT_HISTORY_KEY] = history_id
    return request.app.state.chat_histories.setdefault(history_id, [])


app.state.db_path = os.getenv("PM_DB_PATH", get_default_db_path())


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "hello from backend"}


@app.get("/api/auth/session")
def auth_session(request: Request) -> dict[str, str | bool | None]:
    user = get_authenticated_user(request.session)
    return {
        "authenticated": bool(user),
        "username": user,
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request) -> dict[str, str | bool]:
    if not validate_credentials(payload.username, payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    reset_chat_history(request)
    request.session.clear()
    request.session[SESSION_USER_KEY] = payload.username
    request.session[SESSION_CHAT_HISTORY_KEY] = uuid4().hex
    return {"authenticated": True, "username": payload.username}


@app.post("/api/auth/logout")
def logout(request: Request) -> dict[str, str | bool | None]:
    reset_chat_history(request)
    request.session.clear()
    return {"authenticated": False, "username": None}


@app.get("/api/auth/protected")
def protected(request: Request) -> dict[str, str]:
    user = require_authenticated_user(request)
    return {"message": f"authenticated as {user}"}


@app.get("/api/board")
def get_board(request: Request) -> dict[str, object]:
    user = require_authenticated_user(request)
    repository = get_repository(request)
    return repository.get_board(user)


@app.patch("/api/columns/{column_id}")
def rename_column(
    column_id: Annotated[int, Path(gt=0)],
    payload: RenameColumnRequest,
    request: Request,
) -> dict[str, object]:
    user = require_authenticated_user(request)
    repository = get_repository(request)

    try:
        return repository.rename_column(user, column_id, payload.title)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/cards")
def create_card(payload: CreateCardRequest, request: Request) -> dict[str, object]:
    user = require_authenticated_user(request)
    repository = get_repository(request)

    try:
        return repository.create_card(
            user,
            payload.column_id,
            payload.title,
            payload.details,
        )
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/cards/{card_id}")
def update_card(
    card_id: Annotated[int, Path(gt=0)],
    payload: UpdateCardRequest,
    request: Request,
) -> dict[str, object]:
    user = require_authenticated_user(request)
    repository = get_repository(request)

    try:
        return repository.update_card(user, card_id, payload.title, payload.details)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/cards/{card_id}/move")
def move_card(
    card_id: Annotated[int, Path(gt=0)],
    payload: MoveCardRequest,
    request: Request,
) -> dict[str, object]:
    user = require_authenticated_user(request)
    repository = get_repository(request)

    try:
        return repository.move_card(user, card_id, payload.column_id, payload.position)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/cards/{card_id}")
def delete_card(
    card_id: Annotated[int, Path(gt=0)],
    request: Request,
) -> dict[str, object]:
    user = require_authenticated_user(request)
    repository = get_repository(request)

    try:
        return repository.delete_card(user, card_id)
    except NotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/chat")
def chat(payload: ChatRequest, request: Request) -> JSONResponse:
    user = require_authenticated_user(request)

    if not payload.message.strip():
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "details": "Message is required.",
            },
        )

    repository = get_repository(request)
    history = ensure_chat_history(request)

    try:
        response_payload = run_chat_turn(
            repository=repository,
            username=user,
            message=payload.message.strip(),
            conversation_history=history,
        )
    except AIServiceError as error:
        return JSONResponse(
            status_code=error.status_code,
            content={"error": error.error, "details": error.details},
        )

    history.append({"role": "user", "content": payload.message.strip()})
    history.append(
        {"role": "assistant", "content": str(response_payload["assistant_message"])}
    )
    return JSONResponse(status_code=200, content=response_payload)
