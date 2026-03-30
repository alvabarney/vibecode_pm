from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

DEFAULT_BOARD_NAME = "My Board"
DEFAULT_COLUMN_DEFINITIONS = [
    ("backlog", "Backlog"),
    ("discovery", "Discovery"),
    ("in_progress", "In Progress"),
    ("review", "Review"),
    ("done", "Done"),
]

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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
"""


class RepositoryError(Exception):
    """Base repository error."""


class NotFoundError(RepositoryError):
    """Requested resource was not found."""


class ValidationError(RepositoryError):
    """Request was invalid."""


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def get_default_db_path() -> str:
    return str(Path(__file__).resolve().parent / "data" / "pm.sqlite3")


def init_db(db_path: str) -> None:
    path = Path(db_path)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(path) as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA foreign_keys = ON")
            connection.executescript(SCHEMA_SQL)
            connection.execute(
                """
                INSERT INTO schema_meta(key, value)
                VALUES ('schema_version', '1')
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """
            )
            connection.commit()
    except Exception as exc:
        raise RuntimeError(f"Database initialisation failed: {exc}") from exc


@dataclass(slots=True)
class KanbanRepository:
    db_path: str

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path, timeout=10.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_board(self, username: str) -> dict[str, object]:
        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)
            return self._serialize_board(connection, board_id, user_id)

    def get_ai_board_context(self, username: str) -> dict[str, object]:
        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)
            return {"board": self._serialize_ai_board(connection, board_id, user_id)}

    def rename_column(self, username: str, column_id: int, title: str) -> dict[str, object]:
        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)
            self._rename_column(connection, board_id, column_id, title)
            return self._serialize_board(connection, board_id, user_id)

    def create_card(
        self,
        username: str,
        column_id: int,
        title: str,
        details: str,
        position: int | None = None,
    ) -> dict[str, object]:
        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)
            self._create_card(connection, board_id, column_id, title, details, position)
            return self._serialize_board(connection, board_id, user_id)

    def update_card(
        self,
        username: str,
        card_id: int,
        title: str | None,
        details: str | None,
    ) -> dict[str, object]:
        if title is None and details is None:
            raise ValidationError("At least one field must be provided.")

        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)
            self._update_card(connection, board_id, card_id, title, details)
            return self._serialize_board(connection, board_id, user_id)

    def move_card(
        self, username: str, card_id: int, column_id: int, position: int
    ) -> dict[str, object]:
        if position < 0:
            raise ValidationError("Position must be zero or greater.")

        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)
            self._move_card(connection, board_id, card_id, column_id, position)

            return self._serialize_board(connection, board_id, user_id)

    def delete_card(self, username: str, card_id: int) -> dict[str, object]:
        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)
            self._delete_card(connection, board_id, card_id)
            return self._serialize_board(connection, board_id, user_id)

    def apply_ai_actions(
        self, username: str, actions: list[dict[str, object]]
    ) -> dict[str, object]:
        _valid_action_types = {
            "create_card", "edit_card", "move_card", "delete_card", "rename_column"
        }
        for action in actions:
            action_type = action.get("type")
            if action_type not in _valid_action_types:
                raise ValidationError(f"Unsupported AI action: {action_type!r}.")
            if action_type in ("create_card", "move_card") and "position" in action:
                if int(action["position"]) < 0:
                    raise ValidationError("Card position must be zero or greater.")

        with self.connect() as connection:
            board_id, user_id = self._ensure_user_board(connection, username)

            for action in actions:
                action_type = action["type"]
                if action_type == "create_card":
                    self._create_card(
                        connection,
                        board_id,
                        int(action["column_id"]),
                        str(action["title"]),
                        str(action.get("details", "")),
                        int(action["position"]) if "position" in action else None,
                    )
                elif action_type == "edit_card":
                    self._update_card(
                        connection,
                        board_id,
                        int(action["card_id"]),
                        str(action["title"]) if "title" in action else None,
                        str(action["details"]) if "details" in action else None,
                    )
                elif action_type == "move_card":
                    self._move_card(
                        connection,
                        board_id,
                        int(action["card_id"]),
                        int(action["column_id"]),
                        int(action["position"]),
                    )
                elif action_type == "delete_card":
                    self._delete_card(connection, board_id, int(action["card_id"]))
                elif action_type == "rename_column":
                    self._rename_column(
                        connection,
                        board_id,
                        int(action["column_id"]),
                        str(action["title"]),
                    )
                else:
                    raise ValidationError("Unsupported AI action.")

            return self._serialize_board(connection, board_id, user_id)

    def _rename_column(
        self,
        connection: sqlite3.Connection,
        board_id: int,
        column_id: int,
        title: str,
    ) -> None:
        cleaned_title = title.strip()
        if not cleaned_title:
            raise ValidationError("Column title is required.")

        column = self._get_column(connection, board_id, column_id)
        if not column:
            raise NotFoundError("Column not found.")

        duplicate = connection.execute(
            """
            SELECT id FROM board_columns
            WHERE board_id = ? AND title = ? AND id != ?
            """,
            (board_id, cleaned_title, column_id),
        ).fetchone()
        if duplicate:
            raise ValidationError("A column with that title already exists.")

        connection.execute(
            """
            UPDATE board_columns
            SET title = ?, updated_at = ?
            WHERE id = ?
            """,
            (cleaned_title, utc_now(), column_id),
        )

    def _create_card(
        self,
        connection: sqlite3.Connection,
        board_id: int,
        column_id: int,
        title: str,
        details: str,
        position: int | None,
    ) -> int:
        cleaned_title = title.strip()
        if not cleaned_title:
            raise ValidationError("Card title is required.")

        column = self._get_column(connection, board_id, column_id)
        if not column:
            raise NotFoundError("Column not found.")

        existing_ids = self._get_card_ids_for_column(connection, column_id)
        now = utc_now()
        if position is None or position >= len(existing_ids):
            next_position = self._get_next_card_position(connection, column_id)
            cursor = connection.execute(
                """
                INSERT INTO cards(board_id, column_id, title, details, position, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    board_id,
                    column_id,
                    cleaned_title,
                    details.strip(),
                    next_position,
                    now,
                    now,
                ),
            )
            return int(cursor.lastrowid)

        cursor = connection.execute(
            """
            INSERT INTO cards(board_id, column_id, title, details, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                board_id,
                column_id,
                cleaned_title,
                details.strip(),
                -(len(existing_ids) + 1),
                now,
                now,
            ),
        )
        new_card_id = int(cursor.lastrowid)
        existing_ids.insert(position, new_card_id)
        self._rewrite_column_card_positions(connection, column_id, existing_ids)
        return new_card_id

    def _update_card(
        self,
        connection: sqlite3.Connection,
        board_id: int,
        card_id: int,
        title: str | None,
        details: str | None,
    ) -> None:
        if title is None and details is None:
            raise ValidationError("At least one field must be provided.")

        card = self._get_card(connection, board_id, card_id)
        if not card:
            raise NotFoundError("Card not found.")

        next_title = title.strip() if title is not None else str(card["title"])
        if not next_title:
            raise ValidationError("Card title is required.")
        next_details = details.strip() if details is not None else str(card["details"])

        connection.execute(
            """
            UPDATE cards
            SET title = ?, details = ?, updated_at = ?
            WHERE id = ?
            """,
            (next_title, next_details, utc_now(), card_id),
        )

    def _move_card(
        self,
        connection: sqlite3.Connection,
        board_id: int,
        card_id: int,
        column_id: int,
        position: int,
    ) -> None:
        if position < 0:
            raise ValidationError("Position must be zero or greater.")

        card = self._get_card(connection, board_id, card_id)
        if not card:
            raise NotFoundError("Card not found.")

        target_column = self._get_column(connection, board_id, column_id)
        if not target_column:
            raise NotFoundError("Column not found.")

        source_column_id = int(card["column_id"])

        if source_column_id == column_id:
            card_ids = self._get_card_ids_for_column(connection, column_id)
            card_ids.remove(card_id)
            insert_index = min(position, len(card_ids))
            card_ids.insert(insert_index, card_id)
            self._rewrite_column_card_positions(connection, column_id, card_ids)
            return

        source_ids = self._get_card_ids_for_column(connection, source_column_id)
        source_ids.remove(card_id)

        target_ids = self._get_card_ids_for_column(connection, column_id)
        insert_index = min(position, len(target_ids))
        target_ids.insert(insert_index, card_id)

        connection.execute(
            """
            UPDATE cards
            SET column_id = ?, position = ?, updated_at = ?
            WHERE id = ?
            """,
            (column_id, -(len(target_ids) + 1), utc_now(), card_id),
        )

        self._rewrite_column_card_positions(connection, source_column_id, source_ids)
        self._rewrite_column_card_positions(connection, column_id, target_ids)

    def _delete_card(
        self, connection: sqlite3.Connection, board_id: int, card_id: int
    ) -> None:
        card = self._get_card(connection, board_id, card_id)
        if not card:
            raise NotFoundError("Card not found.")

        column_id = int(card["column_id"])
        connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        self._rewrite_column_card_positions(
            connection,
            column_id,
            self._get_card_ids_for_column(connection, column_id),
        )

    def _ensure_user_board(self, connection: sqlite3.Connection, username: str) -> tuple[int, int]:
        user = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        now = utc_now()

        if user:
            user_id = int(user["id"])
        else:
            cursor = connection.execute(
                """
                INSERT INTO users(username, created_at, updated_at)
                VALUES (?, ?, ?)
                """,
                (username, now, now),
            )
            user_id = int(cursor.lastrowid)

        board = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if board:
            board_id = int(board["id"])
        else:
            cursor = connection.execute(
                """
                INSERT INTO boards(user_id, name, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, DEFAULT_BOARD_NAME, now, now),
            )
            board_id = int(cursor.lastrowid)

        column_count = connection.execute(
            "SELECT COUNT(*) AS count FROM board_columns WHERE board_id = ?",
            (board_id,),
        ).fetchone()
        if column_count and int(column_count["count"]) == 0:
            for position, (slug, title) in enumerate(DEFAULT_COLUMN_DEFINITIONS):
                connection.execute(
                    """
                    INSERT INTO board_columns(board_id, slug, title, position, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (board_id, slug, title, position, now, now),
                )

        return board_id, user_id

    def _serialize_board(
        self, connection: sqlite3.Connection, board_id: int, user_id: int
    ) -> dict[str, object]:
        board = connection.execute(
            """
            SELECT id, name
            FROM boards
            WHERE id = ?
            """,
            (board_id,),
        ).fetchone()
        if not board:
            raise NotFoundError("Board not found.")

        columns = connection.execute(
            """
            SELECT id, slug, title, position
            FROM board_columns
            WHERE board_id = ?
            ORDER BY position ASC, id ASC
            """,
            (board_id,),
        ).fetchall()

        cards = connection.execute(
            """
            SELECT id, column_id, title, details, position
            FROM cards
            WHERE board_id = ?
            ORDER BY column_id ASC, position ASC, id ASC
            """,
            (board_id,),
        ).fetchall()

        cards_by_column: dict[int, list[dict[str, object]]] = {}
        for card in cards:
            cards_by_column.setdefault(int(card["column_id"]), []).append(
                {
                    "id": int(card["id"]),
                    "title": str(card["title"]),
                    "details": str(card["details"]),
                    "position": int(card["position"]),
                }
            )

        return {
            "id": int(board["id"]),
            "name": str(board["name"]),
            "userId": user_id,
            "columns": [
                {
                    "id": int(column["id"]),
                    "slug": str(column["slug"]),
                    "title": str(column["title"]),
                    "position": int(column["position"]),
                    "cards": cards_by_column.get(int(column["id"]), []),
                }
                for column in columns
            ],
        }

    def _serialize_ai_board(
        self, connection: sqlite3.Connection, board_id: int, user_id: int
    ) -> dict[str, object]:
        board = self._serialize_board(connection, board_id, user_id)
        return {
            "id": int(board["id"]),
            "name": str(board["name"]),
            "user_id": int(board["userId"]),
            "columns": [
                {
                    "id": int(column["id"]),
                    "slug": str(column["slug"]),
                    "title": str(column["title"]),
                    "position": int(column["position"]),
                    "cards": [
                        {
                            "id": int(card["id"]),
                            "title": str(card["title"]),
                            "details": str(card["details"]),
                            "position": int(card["position"]),
                        }
                        for card in column["cards"]
                    ],
                }
                for column in board["columns"]
            ],
        }

    def _get_column(
        self, connection: sqlite3.Connection, board_id: int, column_id: int
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT id, board_id
            FROM board_columns
            WHERE id = ? AND board_id = ?
            """,
            (column_id, board_id),
        ).fetchone()

    def _get_card(
        self, connection: sqlite3.Connection, board_id: int, card_id: int
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT id, board_id, column_id, title, details, position
            FROM cards
            WHERE id = ? AND board_id = ?
            """,
            (card_id, board_id),
        ).fetchone()

    def _get_next_card_position(self, connection: sqlite3.Connection, column_id: int) -> int:
        row = connection.execute(
            """
            SELECT COALESCE(MAX(position) + 1, 0) AS next_position
            FROM cards
            WHERE column_id = ?
            """,
            (column_id,),
        ).fetchone()
        return int(row["next_position"])

    def _get_card_ids_for_column(
        self, connection: sqlite3.Connection, column_id: int
    ) -> list[int]:
        return [
            int(row["id"])
            for row in connection.execute(
                """
                SELECT id
                FROM cards
                WHERE column_id = ?
                ORDER BY position ASC, id ASC
                """,
                (column_id,),
            ).fetchall()
        ]

    def _rewrite_column_card_positions(
        self,
        connection: sqlite3.Connection,
        column_id: int,
        card_ids: list[int],
    ) -> None:
        self._stage_temporary_positions(connection, card_ids)

        for position, current_card_id in enumerate(card_ids):
            connection.execute(
                """
                UPDATE cards
                SET position = ?, updated_at = ?
                WHERE id = ? AND column_id = ?
                """,
                (position, utc_now(), current_card_id, column_id),
            )

    def _stage_temporary_positions(
        self, connection: sqlite3.Connection, card_ids: list[int]
    ) -> None:
        for index, current_card_id in enumerate(card_ids, start=1):
            connection.execute(
                """
                UPDATE cards
                SET position = ?
                WHERE id = ?
                """,
                (-index, current_card_id),
            )
