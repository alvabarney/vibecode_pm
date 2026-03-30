# Database schema and persistence design

This document defines the proposed Phase 5 SQLite persistence model for the Project Management MVP.

## Goals

- Use SQLite as the single local database.
- Support multiple users in the schema, even though the MVP only allows one dummy login.
- Store one board per user for MVP.
- Keep card and column updates simple and testable.
- Generate a canonical JSON board view for AI prompts from relational data.

## Recommendation summary

- Use normalized relational tables: `users`, `boards`, `board_columns`, `cards`.
- Store column order and card order explicitly with integer position fields.
- Create the database automatically if missing.
- Seed a default board and five default columns for a new user on first access.
- Build the AI prompt payload from a deterministic relational-to-JSON projection function.

## Why normalized tables instead of a board JSON blob

- Card-level operations map directly to CRUD updates.
- Reordering and moving cards are easier to test with clear row updates.
- Data integrity is stronger with foreign keys and unique constraints.
- Future multi-user and reporting features are easier to support.
- AI can still receive JSON by projecting relational rows into a canonical board structure.

## Proposed database file

- Default local path: `backend/data/pm.sqlite3`
- In Docker, this should eventually be backed by a mounted volume so data survives container restarts.

## Schema

### `users`

Purpose:
- Represents application users.

Columns:
- `id INTEGER PRIMARY KEY`
- `username TEXT NOT NULL UNIQUE`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Notes:
- MVP login uses hardcoded credentials, but the DB still stores a user row.

### `boards`

Purpose:
- Stores a single Kanban board per user for MVP.

Columns:
- `id INTEGER PRIMARY KEY`
- `user_id INTEGER NOT NULL UNIQUE`
- `name TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

Notes:
- `user_id UNIQUE` enforces one board per user in MVP.

### `board_columns`

Purpose:
- Stores the fixed board columns and their display order.

Columns:
- `id INTEGER PRIMARY KEY`
- `board_id INTEGER NOT NULL`
- `slug TEXT NOT NULL`
- `title TEXT NOT NULL`
- `position INTEGER NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE`
- `UNIQUE(board_id, slug)`
- `UNIQUE(board_id, position)`

Notes:
- `slug` is a stable internal identifier.
- `title` is user-editable.
- MVP seeds exactly five columns:
  - `backlog`
  - `discovery`
  - `in_progress`
  - `review`
  - `done`

### `cards`

Purpose:
- Stores cards within a board column.

Columns:
- `id INTEGER PRIMARY KEY`
- `board_id INTEGER NOT NULL`
- `column_id INTEGER NOT NULL`
- `title TEXT NOT NULL`
- `details TEXT NOT NULL DEFAULT ''`
- `position INTEGER NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints:
- `FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE`
- `FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE CASCADE`
- `UNIQUE(column_id, position)`

Notes:
- `position` is relative to other cards in the same column.
- Keeping both `board_id` and `column_id` makes board-scoped queries simpler and easier to validate.

## Suggested SQL DDL

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS board_columns (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  UNIQUE(board_id, slug),
  UNIQUE(board_id, position)
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL,
  column_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE CASCADE,
  UNIQUE(column_id, position)
);
```

## Ordering rules

- Columns are ordered by `board_columns.position ASC`.
- Cards are ordered within each column by `cards.position ASC`.
- Reordering within a column should rewrite affected `position` values to a dense zero-based or one-based sequence.
- Moving a card across columns should:
  - update `column_id`
  - rewrite source column positions
  - rewrite destination column positions

## Initialization and migration strategy

Recommended MVP approach:

- On backend startup, run `init_db()`.
- `init_db()` should:
  - create the database file if missing
  - enable `PRAGMA foreign_keys = ON`
  - execute `CREATE TABLE IF NOT EXISTS` statements

Recommended lightweight versioning:

- Add a tiny `schema_meta` table when implementation begins:
  - `key TEXT PRIMARY KEY`
  - `value TEXT NOT NULL`
- Store the current schema version there.
- For MVP, version `1` is enough.
- Do not introduce a heavyweight migration framework yet.

Rationale:

- This keeps startup deterministic and simple.
- It avoids premature migration tooling while still leaving a clear upgrade path.

## Default seed data

When the dummy user first signs in and no DB rows exist yet:

1. Ensure a `users` row exists for `user`.
2. Ensure one `boards` row exists for that user.
3. Seed five columns in this order:
   - Backlog
   - Discovery
   - In Progress
   - Review
   - Done
4. Seed no cards initially, or optionally migrate the current demo seed data later if desired.

Recommendation:

- Start with empty persistence state in the DB.
- Keep the current rich demo seed data only in the frontend until Phase 7 replaces local state.

## Canonical board JSON projection for AI

The backend should expose an internal function that converts relational rows into a deterministic JSON structure before sending board context to the AI layer.

Recommended shape:

```json
{
  "board": {
    "id": 1,
    "name": "My Board",
    "user_id": 1,
    "columns": [
      {
        "id": 10,
        "slug": "backlog",
        "title": "Backlog",
        "position": 0,
        "cards": [
          {
            "id": 101,
            "title": "Draft release notes",
            "details": "Summarize MVP changes.",
            "position": 0
          }
        ]
      }
    ]
  }
}
```

Projection rules:

- Columns must always be sorted by `position`.
- Cards within each column must always be sorted by `position`.
- The projection should include stable numeric IDs for later AI action targeting.
- Only include fields the AI actually needs for board reasoning and updates.

## Repository boundaries for implementation

Recommended repository/service split:

- `UserRepository`
  - get or create user by username
- `BoardRepository`
  - get board by user
  - create default board for user
- `ColumnRepository`
  - list columns for board
  - rename column
  - reorder columns if ever needed
- `CardRepository`
  - list cards by board
  - create card
  - update card
  - move card
  - delete card

For MVP simplicity, a smaller combined `KanbanRepository` is also acceptable if it remains easy to test.

## Test plan for the implementation phase

Unit tests should cover:

- DB initialization creates tables on a missing DB.
- get/create user behavior.
- default board creation for a first-time user.
- default column seeding order.
- card create/update/delete behavior.
- move/reorder behavior preserves dense positions.
- board JSON projection ordering and shape.

Integration tests should cover:

- DB file is created automatically when missing.
- data persists across application restarts.
- each user resolves to only their own board.
- board reads/writes remain scoped to authenticated user.

## Open implementation choices resolved here

- Use normalized SQLite tables, not a single board JSON blob.
- Keep chat history out of the DB for MVP.
- Keep one board per user for MVP using a unique constraint on `boards.user_id`.
- Use relational storage plus deterministic JSON projection for AI.
