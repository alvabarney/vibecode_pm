# Code Review

Date: 2026-03-30

---

## Summary

Full-stack Kanban MVP with FastAPI + SQLite backend, Next.js static frontend, and OpenRouter AI integration. The architecture is clean and well-suited to MVP scope. Core concerns are around credential security, rate limiting, and a handful of correctness issues in drag/drop and card positioning.

---

## Backend

### Security
- **Critical — Hardcoded default credentials** (`auth.py`): `PM_USERNAME=user` / `PM_PASSWORD=password` as env var defaults. Require explicit override; fail fast if not set.
- **High — Ephemeral session secret** (`main.py`): Random `SESSION_SECRET` generated on startup if not provided — all sessions invalidated on restart. Require persistent key.
- **Medium — CORS origins hardcoded** (`main.py`): Only allows `localhost:3000` and `localhost:8080`. Make configurable via env var.
- **Medium — API key in error logs** (`ai.py`): OpenRouter `Authorization` header not sanitized before logging. Sanitize headers in error output.

### Bugs / Correctness
- **High — Card position algorithm fragility** (`db.py`): Uses negative temporary positions during reorder. If a transaction fails mid-update, negative positions can persist. Design is fragile; should be replaced with a single atomic `UPDATE ... CASE` statement.
- **Medium — Potential duplicate AI actions on retry** (`ai.py`): If a request succeeds but response parsing fails, the request is retried. A card could be created twice from a single chat turn. Add idempotency keys.
- **Medium — Chat history in-process and unbounded** (`main.py`): `app.state.chat_histories` is a plain dict, lost on restart, with no size limit. Document the restart behavior; add a cap per session.
- **Low — `finish_reason` not checked** (`ai.py`): Logged but not acted on. A truncated response (`"length"`) could result in a partial action being applied silently.

### Performance
- **High — Full board serialized on every mutation** (`db.py`): Every card operation walks and serializes the entire board. Return only the changed resource.
- **Medium — Position array built in Python** (`db.py`): Card insertion loads all card IDs for a column to compute position. Calculate insert position in SQL instead.

### Quality
- **Medium — Inconsistent error response shape**: Most endpoints return `{"detail": "..."}` (FastAPI default); chat endpoint returns `{"error": "...", "details": "..."}`. Standardize.
- **Medium — No input length limits**: `title` and `details` fields are stripped but not length-capped in the DB layer. Add max lengths to Pydantic models.

### Strengths
- Clean schema with proper FK constraints, cascading deletes, WAL mode, and `PRAGMA foreign_keys = ON`.
- Strong Pydantic validation layer for AI actions (discriminated union, field validators, null-coercion).
- AI actions applied atomically — any failure rolls back the entire turn.
- Good test coverage: 14 API tests, 7 repository tests, 4 contract tests covering happy paths and error cases.

---

## Frontend

### Security
- **Medium — Pre-filled credentials** (`AppShell.tsx`): Login form defaults to `user` / `password`. Clear defaults before any non-local deployment.
- **Low — No CSRF token**: Session cookie used without explicit CSRF header. `SameSite=Lax` provides baseline protection, but an `X-CSRF-Token` header would be safer.

### Bugs / Correctness
- **High — Race condition in drag operations** (`KanbanBoard.tsx`): `activeCardId` is cleared in `handleDragEnd` before the PATCH request completes. Two rapid drags can result in the second using a stale card reference.
- **Medium — Modal focus regression** (`CardEditModal.tsx:21`): `useEffect` dependency is `[card.id]` — focus resets if the card object reference changes but the ID stays the same. Should depend on `[card]`.
- **Medium — Chat message ID collisions** (`KanbanBoard.tsx`): IDs use `Date.now()` + random suffix. Use a counter or `crypto.randomUUID()` instead.
- **Low — No error boundary**: An unhandled React render error crashes the entire board with no recovery UI.

### Performance
- **High — Full board re-render on any mutation** (`KanbanBoard.tsx`): `setBoard()` replaces the entire board object. Memoize columns and cards with `React.memo` to limit re-renders.
- **Medium — No virtualization**: All cards rendered regardless of viewport. Add virtual scroll (e.g., `react-window`) for large boards.
- **Medium — Chat message list unbounded** (`AiSidebar.tsx`): No cap on message history. Limit to last ~50 messages.

### Quality
- **High — Backend port hardcoded** (`api.ts:59`): Port `18000` is a magic number. Move to env var or config constant.
- **Medium — Error key guessing** (`api.ts`): Checks for `detail`, `details`, and `error` keys to extract error messages, reflecting the inconsistency in the backend. Fix the backend shape and simplify this.
- **Medium — No loading/error distinction** (`KanbanBoard.tsx`): Board fetch has `loading | ready` states but no explicit error state — a failed fetch just clears loading and shows an error message while `board` is null.

### Strengths
- dnd-kit integrated correctly with `SortableContext`, collision detection, and drag overlay.
- TypeScript throughout with few `any` types; discriminated union for AI actions mirrors backend.
- Accessibility: ARIA labels on chat region, associated form labels, keyboard nav (Escape to close modal).
- Clean component decomposition — `KanbanCard`, `KanbanColumn`, `AiSidebar`, `CardEditModal` are small and focused.

---

## AI Integration

### Security
- **Medium — No rate limiting on `/api/chat`** (`main.py`): Any authenticated session can exhaust the OpenRouter quota. Add a per-session rate limit (e.g., 10 req/min).

### Bugs / Correctness
- **Medium — `finish_reason` ignored**: Partial responses (model stopped early) parsed as if complete. Check and warn.
- **Low — System prompt hard-coded inline** (`ai.py`): 23-line prompt embedded in code. Load from file for easier iteration.

### Performance
- **High — No response caching**: Identical queries hit OpenRouter every time. Cache responses for a short TTL.
- **Medium — Full board context in every request**: At 500 cards this is ~50KB per request. Consider summarizing or sending a condensed context.

### Strengths
- Structured response parsing with Pydantic strict mode prevents hallucinated actions.
- Retry logic with exponential backoff on rate-limit errors.
- `AIServiceError` dataclass maps OpenRouter errors to user-friendly messages.
- `chat_service.py` cleanly separates AI coordination from board mutation.

---

## Infrastructure

- **Medium — Health check fragility** (`docker-compose.yml`): Health check uses a Python one-liner; `curl` against the `/api/board` endpoint would be more reliable.
- **Low — No restart policy**: Add `restart: unless-stopped` to both services.
- **Low — Frontend depends on backend health**: Unnecessary coupling for independent static assets.

---

## Priority List

| Priority | Issue |
|----------|-------|
| Critical | Remove/require override of default credentials |
| High | Add rate limiting to `/api/chat` |
| High | Fix card position algorithm (negative temp values) |
| High | Fix drag race condition (stale `activeCardId`) |
| High | Cap and persist chat history |
| High | Require persistent `SESSION_SECRET` |
| Medium | Standardize API error response shape |
| Medium | Fix modal focus regression |
| Medium | Make CORS origins and backend port configurable |
| Medium | Add idempotency to AI retry logic |
| Low | Add error boundary |
| Low | Add `restart: unless-stopped` to docker-compose |
