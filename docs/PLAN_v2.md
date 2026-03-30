# Project Management MVP - Plan v2

This version incorporates clarified requirements and guidance:
- Auth: server-managed session/cookie.
- Frontend delivery: static Next.js export served as static files.
- Infrastructure: multi-container via Docker Compose.
- Data model: normalized SQLite relational schema (AI receives derived JSON view).
- AI: backend-defined structured output contract, using OpenRouter with `openai/gpt-oss-120b:free` for MVP local development.
- Chat history: in-memory per session.
- Script interface: `manage_pm <start|stop|restart|status|help>`.
- Quality gates: minimum 80% unit test coverage + robust integration testing.

## Delivery principles

- Keep implementation simple and pragmatic; avoid over-engineering.
- Prove root cause before fixes when debugging.
- Gate each phase with concrete tests and success criteria.
- Require user sign-off at specific checkpoints before continuing.

## Phase 1 - Planning and alignment

### Tasks

- [x] Convert this plan into the active execution checklist.
- [x] Confirm architecture choices and constraints are reflected in docs.
- [x] Create `frontend/AGENTS.md` summarizing current frontend structure and behavior.
- [x] Define test strategy by layer:
  - Unit tests for backend services, auth/session logic, DB repositories, AI response parsing.
  - Integration tests for API endpoints, auth flow, persistence behavior, AI endpoint behavior.
  - Frontend tests for key UI logic (login, board rendering, card interactions, AI sidebar updates).
- [x] Define coverage command and threshold enforcement (80% minimum unit coverage):
  - Frontend unit coverage gate: `npm run test:unit -- --coverage --coverage.thresholds.lines=80 --coverage.thresholds.functions=80 --coverage.thresholds.statements=80 --coverage.thresholds.branches=80`
  - Backend unit coverage gate (planned): `pytest -m unit --cov=backend --cov-report=term-missing --cov-fail-under=80`

### Tests

- [x] Documentation sanity check: all required decisions captured and internally consistent.

### Success criteria

- [x] User approves the plan and architecture decisions.
- [x] `frontend/AGENTS.md` exists and accurately describes the frontend baseline.
- [x] Test strategy and quality gate are explicit and unambiguous.

---

## Phase 2 - Scaffolding and Docker Compose foundation

### Tasks

- [x] Create backend FastAPI skeleton in `backend/`.
- [x] Create Dockerfiles for:
  - backend runtime (FastAPI + uv dependency management)
  - frontend build/export stage
  - static serving stage (served by backend static mount or dedicated static container, but under docker compose control)
- [x] Create `docker-compose.yml` for multi-container orchestration.
- [x] Add health checks and service dependencies where useful.
- [x] Implement `scripts/manage_pm` with:
  - `start` (build/start stack)
  - `stop` (graceful stop)
  - `restart`
  - `status`
  - `help`
- [x] Validate environment loading, including `OPENROUTER_API_KEY` for later phases.
- [x] Wire a temporary hello-world page and hello API route to prove end-to-end routing.

### Tests

- [x] Integration test: API hello endpoint responds from backend container.
- [x] Integration test: root static page is reachable through compose stack.
- [x] Script tests (or command checks): each `manage_pm` action works as intended.

### Success criteria

- [x] `manage_pm start` boots the stack reliably.
- [x] Static page and API endpoint are both accessible.
- [x] `manage_pm status` reports useful service state.
- [x] Host backend port uses `18000` (container `8000`) to avoid common local port conflicts.

---

## Phase 3 - Frontend static export integration

### Tasks

- [x] Build frontend as static export from existing Next.js demo.
- [x] Serve exported assets from deployed stack root (`/`).
- [x] Ensure frontend routes/assets resolve correctly in containerized environment.
- [x] Remove temporary hello-world UI once Kanban demo is served.

### Tests

- [x] Integration test: `/` renders Kanban demo UI in running stack.
- [x] Integration test: static assets load without missing-path errors.
- [x] Frontend unit tests for critical rendering behavior pass.

### Success criteria

- [x] Kanban demo appears at root URL through compose setup.
- [x] No dependency on Next server runtime for MVP.

---

## Phase 4 - Session-based login/logout flow

### Tasks

- [x] Add login page/flow requiring `user` / `password`.
- [x] Implement server-side auth endpoint validating dummy credentials.
- [x] Issue secure session cookie (HTTPOnly, SameSite suitable for local MVP).
- [x] Add auth guard behavior so unauthenticated users cannot access board data.
- [x] Implement logout endpoint and UI behavior.

### Tests

- [x] Unit tests for auth/session service logic.
- [x] Integration tests:
  - [x] login success sets session cookie
  - [x] invalid login rejected
  - [x] protected routes reject unauthenticated users
  - [x] logout invalidates session
- [x] Frontend tests for login UX and redirect/gating behavior.

### Success criteria

- [x] Only authenticated users can access Kanban features.
- [x] Login and logout behave correctly across refresh/navigation.

---

## Phase 5 - Database schema and persistence design (normalized SQLite)

### Tasks

- [x] Design normalized SQLite schema for multi-user support:
  - [x] users
  - [x] boards (1 per user for MVP)
  - [x] columns
  - [x] cards
- [x] Include ordering fields for columns/cards.
- [x] Define migration/init strategy (create DB if missing).
- [x] Document schema and persistence approach in `docs/`.
- [x] Define board serialization function to produce AI-ready JSON projection from relational data.
- [x] Obtain user sign-off on schema and persistence docs before API implementation.

### Tests

- [x] Unit tests for repository CRUD behavior.
- [x] Integration tests verifying:
  - [x] DB initialization on missing file
  - [x] persistence across restarts
  - [x] per-user board isolation

### Success criteria

- [x] Schema is normalized, practical for card-level updates, and documented.
- [x] AI JSON projection from relational model is deterministic and specified.
- [x] User approves schema documentation.

---

## Phase 6 - Backend Kanban API

### Tasks

- [x] Implement REST API for board read/update operations.
- [x] Add endpoints for:
  - [x] board fetch
  - [x] card create/edit/move/delete
  - [x] column rename
  - [x] optional reorder helpers as needed
- [x] Enforce session auth on protected API routes.
- [x] Ensure operations are scoped to authenticated user.

### Tests

- [x] Unit tests for service-layer board manipulation rules.
- [x] Integration tests for each endpoint covering success and failure paths.
- [x] Integration tests for authorization and cross-user data isolation.

### Success criteria

- [x] Backend can persistently manage Kanban data for authenticated users.
- [x] DB auto-creates when absent and remains stable after repeated runs.

---

## Phase 7 - Connect frontend to backend persistence

### Tasks

- [x] Replace frontend demo-local state with API-backed state.
- [x] Preserve UX for drag/drop and edits while syncing to backend.
- [x] Add optimistic or immediate refresh behavior that keeps UI consistent.
- [x] Handle error states simply and clearly.

### Tests

- [x] Frontend unit tests for API client and state transitions.
- [x] Integration/e2e-style tests for:
  - [x] login -> board load
  - [x] card edits/moves persisted
  - [x] reload shows saved state

### Design notes

- Drag/drop target resolution is computed client-side from the current rendered board state, then persisted through the backend move endpoint.
- Backend card moves use temporary staging positions before final dense reindexing so SQLite `UNIQUE(column_id, position)` constraints do not fail during reorder or cross-column moves.
- Frontend column highlighting tracks the active drag-over column explicitly so the intended drop target is visually consistent.

### Success criteria

- [x] App functions as a real persistent Kanban board, not a local-only demo.
- [x] Core Kanban user flows are stable through refresh/restart cycles.

---

## Phase 8 - AI connectivity via OpenRouter

### Tasks

- [x] Add backend AI client integration using `OPENROUTER_API_KEY`.
- [x] Configure model: `openai/gpt-oss-120b:free`.
- [x] Build minimal `/api/chat` backend route for the connectivity probe.
- [x] Implement a deterministic connectivity check prompt (for example `2+2`).

### Tests

- [x] Integration test for successful `/api/chat` live request path hitting the running server and OpenRouter.
- [x] Integration test for missing/invalid key handling with clear error response.

### Success criteria

- [x] Backend can successfully call OpenRouter in runtime environment.
- [x] Failures are surfaced with actionable, non-ambiguous errors.

### Current status

- `/api/chat` is implemented as the Phase 8 connectivity route.
- Live end-to-end verification passed against the running server using `openai/gpt-oss-120b:free`.
- The root cause of the earlier failures was model selection, not backend routing: `openai/gpt-oss-120b` required credits, while `openai/gpt-oss-120b:free` succeeded with the active key.

---

## Phase 9 - Structured AI output for chat + board updates

### Tasks

- [x] Keep `/api/chat` as the single backend chat endpoint and extend it from connectivity-only behavior to validated structured output handling.
- [x] Define the Phase 9 structured output contract produced by the backend AI call.
- [x] Use a strict backend-owned response shape:
  - `assistant_message` (string, required)
  - `kanban_actions` (array, required but may be empty)
  - each action is a tagged object with `type` plus a typed payload
- [x] Start with this action set only:
  - `create_card` with `column_id`, `title`, `details`, and optional `position`
  - `edit_card` with `card_id`, optional `title`, optional `details`
  - `move_card` with `card_id`, `column_id`, `position`
  - `delete_card` with `card_id`
  - `rename_column` with `column_id`, `title`
- [x] Add backend validation rules before any mutation:
  - reject unknown action types
  - reject missing required fields
  - reject wrong field types
  - reject empty titles where titles are required
  - reject references to missing cards or columns
- [x] Build the AI request context from:
  - the canonical board JSON projection defined in `docs/DB_SCHEMA.md`
  - the current user message
  - in-memory session conversation history for the authenticated session
- [x] Keep the prompt contract simple:
  - instruct the model to always return the backend-defined JSON shape
  - instruct the model to leave `kanban_actions` empty when no board update is needed
  - do not let the model invent unsupported action types or fields
- [x] Execute validated actions in order and return:
  - `assistant_message`
  - `kanban_actions`
  - updated board snapshot when actions were applied
- [x] Apply all actions in a single request scope and fail safely:
  - if validation fails, do not mutate the board
  - if action application fails mid-sequence, return an error and preserve data integrity
- [x] Keep conversation history in memory only for MVP and clear it on logout/session loss.

### Tests

- [x] Unit tests for structured output parser/validator.
- [x] Unit tests for action-application logic.
- [x] Integration tests:
  - no-op response (message only)
  - single action update
  - multi-action update
  - malformed response rejected safely.
- [x] Integration tests:
  - board context payload contains deterministic ordering and stable IDs
  - conversation history is included across multiple chat turns in the same session
  - logout or new session resets in-memory chat history
- [x] Integration tests through `/api/chat` only; do not add a second public AI mutation endpoint.

### Success criteria

- [x] AI responses are machine-validated before data mutation.
- [x] Valid actions update Kanban correctly; invalid actions do not corrupt state.
- [x] `/api/chat` remains the single user-facing backend endpoint for AI chat and AI-driven board updates.

### Proposed response contract for sign-off

```json
{
  "assistant_message": "I moved the release task into Review and renamed Backlog to Ideas.",
  "kanban_actions": [
    {
      "type": "move_card",
      "card_id": 101,
      "column_id": 13,
      "position": 0
    },
    {
      "type": "rename_column",
      "column_id": 10,
      "title": "Ideas"
    }
  ]
}
```

### Current status

- Backend implementation is in place for Phase 9.
- Local automated verification is passing for parser validation, transaction-safe action application, board context generation, and session-scoped history handling.
- Live provider verification of the structured-output path is currently intermittent because `openai/gpt-oss-120b:free` is being rate-limited upstream by OpenRouter's free provider.

---

## Phase 10 - Frontend AI sidebar and live board updates

### Tasks

- [x] Add AI chat sidebar UI integrated into existing board layout.
- [x] Send user prompts to backend AI endpoint with session context.
- [x] Render assistant responses in chat thread.
- [x] When AI response includes board actions, refresh board state automatically.
- [x] Keep UX clean and minimal; avoid unnecessary complexity.

### Tests

- [x] Frontend tests for sidebar interaction, message rendering, and error states.
- [ ] Integration/e2e tests:
  - AI chat response visible
  - AI-driven board updates reflected without manual refresh
  - auth/session still enforced.

### Success criteria

- [x] Sidebar supports full chat flow and reliable board synchronization.
- [x] AI-assisted board changes feel immediate and predictable.

### Current status

- Frontend AI sidebar is implemented and wired to `/api/chat`.
- Unit tests pass for chat rendering, error handling, and board refresh behavior.
- Standard Playwright flows pass against the compose-served app at `http://127.0.0.1:8080`.
- A live AI Playwright test has been added and is env-guarded, but full browser verification of the real AI flow remains dependent on temporary free-provider rate limits from OpenRouter.

---

## Cross-cutting quality gates

- [ ] Unit test coverage is at least 80% (enforced in CI/local quality command).
- [ ] Integration tests cover critical user journeys end-to-end.
- [ ] Lint/type checks pass across backend and frontend.
- [ ] Startup script and compose workflows are documented and repeatable.

## Required sign-off checkpoints

- [x] Checkpoint A: approve planning doc and architecture (after Phase 1).
- [x] Checkpoint B: approve schema and persistence docs (after Phase 5).
- [x] Checkpoint C: approve AI structured output contract (before full UI AI rollout if adjustments are needed).

## Notes for implementation

- Prioritize straightforward implementations that are easy to reason about.
- Prefer explicit contracts and predictable data transforms over implicit magic.
- Keep docs concise but sufficient for maintenance and onboarding.
