# Frontend overview

This document describes the current frontend codebase.

## Purpose

- Provides a statically exported Next.js Kanban app.
- Uses backend session auth plus backend-persisted board state.
- Supports column rename, card add/delete, drag/drop movement, and an AI chat sidebar.

## Stack

- Next.js App Router (`next` 16)
- React 19
- TypeScript
- Tailwind CSS
- `@dnd-kit` for drag/drop
- Vitest + Testing Library for unit tests
- Playwright for browser integration tests

## Current app structure

- `src/app/page.tsx`: renders `AppShell`.
- `src/components/AppShell.tsx`: handles session check, login form, and logout flow.
- `src/components/KanbanBoard.tsx`: top-level board state and interactions.
- `src/components/AiSidebar.tsx`: sidebar chat UI for sending prompts and rendering the chat thread.
- `src/components/KanbanColumn.tsx`: column UI, title editing, droppable area.
- `src/components/KanbanCard.tsx`: sortable card UI and delete action.
- `src/components/NewCardForm.tsx`: inline create-card form.
- `src/components/KanbanCardPreview.tsx`: drag overlay preview.
- `src/lib/api.ts`: browser API client for auth and board endpoints.
- `src/lib/api.ts`: browser API client for auth, board, and `/api/chat` endpoints.
- `src/lib/kanban.ts`: board types plus drag/drop move-target helpers.

## State and behavior notes

- Session state is fetched from the backend on app load.
- Board data is fetched from `GET /api/board` after login.
- Board mutations use backend endpoints and replace local board state with the returned canonical board payload.
- AI chat uses `POST /api/chat`; assistant responses are shown in the sidebar and any returned board snapshot replaces the current board state.
- Drag/drop computes the target move client-side, then persists the move through the backend.
- Login uses backend session endpoints and cookie credentials.
- Board persistence now lives in the backend SQLite database.
- The visible chat thread is stored client-side for the current page session; backend history remains session-scoped on the server.

## Tests currently present

- Unit tests:
  - `src/components/AppShell.test.tsx` for login/logout and auth gating.
  - `src/lib/kanban.test.ts` for drag/drop move-target behavior.
  - `src/components/KanbanBoard.test.tsx` for persisted board load/rename/add/delete flows plus AI sidebar behavior.
- E2E tests:
  - `tests/kanban.spec.ts` for login, invalid credentials, logout, persisted board reload behavior, and an env-guarded live AI sidebar test.

## Known constraints

- Deployed frontend expects backend API on host port `18000`.
- Playwright can target either the dev server or deployed stack via env vars.
- The live AI browser test depends on OpenRouter free-tier availability and may be rate-limited upstream.

## Planned evolution in this project

- Refine the AI sidebar UX as needed while keeping the implementation simple.
