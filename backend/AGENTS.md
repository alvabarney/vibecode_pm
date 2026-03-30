# Backend overview

This backend is a FastAPI service scaffold for the Project Management MVP.

## Current scope

- Runs a FastAPI app from `backend/main.py`.
- Uses SQLite persistence through `backend/db.py`.
- Uses OpenRouter chat connectivity through `backend/ai.py`, currently configured for `openai/gpt-oss-120b:free`.
- Exposes:
  - `GET /api/health` -> service health check
  - `GET /api/hello` -> temporary hello response for compose verification
  - `GET /api/auth/session` -> current session state
  - `POST /api/auth/login` -> validates dummy credentials and starts a session
  - `POST /api/auth/logout` -> clears the session
  - `GET /api/auth/protected` -> protected test route for auth verification
  - `GET /api/board` -> fetches the authenticated user's board
  - `PATCH /api/columns/{column_id}` -> renames a column
  - `POST /api/cards` -> creates a card in a column
  - `PATCH /api/cards/{card_id}` -> edits a card
  - `PATCH /api/cards/{card_id}/move` -> moves a card within/across columns
  - `DELETE /api/cards/{card_id}` -> deletes a card
  - `POST /api/chat` -> authenticated OpenRouter-backed chat route returning structured assistant output and optional board updates
- Includes local CORS setup for frontend testing from `localhost:8080` and `localhost:3000`.
- Uses cookie-based sessions via Starlette `SessionMiddleware`.
- Keeps chat history in server memory keyed by session and clears it on logout.
- Initializes the DB on app startup and seeds a default board/columns on first board access.
- In Docker Compose, the DB is persisted via a mounted `backend/data` directory.

## Tooling

- Python dependency management with `uv` in container runtime.
- Unit tests with `pytest` and FastAPI `TestClient`.
- Containerized via `backend/Dockerfile`.

## Planned evolution

- Add frontend AI sidebar integration on top of `/api/chat`.