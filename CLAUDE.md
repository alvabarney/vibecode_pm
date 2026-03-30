# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack Kanban board with AI chat integration. Single user, MVP-scope. Backend is the source of truth; frontend is a stateless display layer.

- **Backend**: FastAPI + SQLite, served on port 8000 (18000 externally)
- **Frontend**: Next.js static export served by Nginx on port 80 (8080 externally)
- **AI**: OpenRouter API (`openai/gpt-oss-120b:free`) for structured board mutations via chat

MVP constraints: single hardcoded user (`user`/`password`), one board per user, local Docker deployment only.

## Commands

### Full Stack (Docker)

```bash
scripts/manage_pm start    # Build and start (frontend: :8080, backend: :18000)
scripts/manage_pm stop
scripts/manage_pm restart
scripts/manage_pm status
```

### Backend

```bash
cd backend
uv sync                                        # Install deps
uv run uvicorn main:app --reload              # Dev server on :8000
uv run pytest                                  # All tests
uv run pytest tests/test_api.py               # Single test file
uv run pytest -k "test_name"                  # Single test by name
uv run pytest --cov                            # With coverage
```

### Frontend

```bash
cd frontend
npm install
npm run dev                  # Dev server on :3000
npm run build                # Static export to out/
npm run lint                 # ESLint
npm run test:unit            # Vitest unit tests
npm run test:unit:watch      # Watch mode
npm run test:e2e             # Playwright E2E (requires running stack)
npm run test:all             # Unit + E2E
```

## Architecture

### Data Flow

1. User authenticates → session cookie stored server-side via Starlette `SessionMiddleware`
2. Frontend fetches board from `GET /api/board` → renders columns and cards
3. Drag-and-drop moves computed by dnd-kit client-side → persisted via `PATCH /api/cards/{id}/move`
4. AI chat: message sent to `POST /api/chat` → backend fetches full board context, calls OpenRouter, validates structured response against Pydantic schema, applies mutations, returns updated board

### Backend Modules

| File | Purpose |
|------|---------|
| `main.py` | All FastAPI routes (auth, board, cards, columns, chat) |
| `db.py` | `KanbanRepository` — all SQLite access; schema init and seeding |
| `chat_service.py` | Orchestrates chat turns: board context → AI → validate → apply |
| `chat_contract.py` | Pydantic models for `StructuredChatResponse` and `KanbanAction` types |
| `ai.py` | OpenRouter HTTP client |
| `auth.py` | Session login/logout logic (hardcoded credentials) |

Default board is seeded with 5 fixed columns on first access: Backlog, Discovery, In Progress, Review, Done.

### Frontend Components

- `AppShell.tsx` — root; manages session state and login form
- `KanbanBoard.tsx` — board state, column/card CRUD, dnd-kit context
- `AiSidebar.tsx` — chat thread UI, calls `/api/chat`, triggers board refresh on AI mutations
- `src/lib/api.ts` — all `fetch` calls to backend
- `src/lib/kanban.ts` — board types and drag/drop position utilities

### AI Action Contract

The AI returns a `StructuredChatResponse` with an optional list of `KanbanAction` items. Supported action types: `create_card`, `edit_card`, `move_card`, `delete_card`, `rename_column`. Actions are validated by Pydantic before being applied to the database.

### Key Configuration

- Backend CORS allows `localhost:3000` (dev) and `localhost:8080` (Docker)
- Frontend hardcodes backend at `window.location.hostname:18000` (in `api.ts`)
- SQLite database persisted at `backend/data/pm.sqlite3` (Docker volume)
- `OPENROUTER_API_KEY` required in `.env` at repo root

## Testing Notes

- Backend tests in `backend/tests/` — `test_api.py`, `test_auth.py`, `test_chat_contract.py`, `test_repository.py`, `test_live_ai.py`
- Frontend unit tests co-located with source (`*.test.tsx`, `*.test.ts`) and run with Vitest
- E2E tests in `frontend/tests/kanban.spec.ts` — Playwright targeting `:3000` (dev) or `:8080` (stack)
- E2E tests require a running backend; set `BASE_URL` env var to override default target
