from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pytest

from db import KanbanRepository, NotFoundError, init_db


def test_init_db_creates_database_file(db_path: str) -> None:
    path = Path(db_path)
    assert not path.exists()

    init_db(db_path)

    assert path.exists()


def test_repository_seeds_default_board_and_columns(repository: KanbanRepository) -> None:
    board = repository.get_board("user")

    assert board["name"] == "My Board"
    assert [column["slug"] for column in board["columns"]] == [
        "backlog",
        "discovery",
        "in_progress",
        "review",
        "done",
    ]


def test_repository_card_crud_and_move_preserve_dense_positions(
    repository: KanbanRepository,
) -> None:
    board = repository.get_board("user")
    backlog_id = board["columns"][0]["id"]
    review_id = board["columns"][3]["id"]

    board = repository.create_card("user", backlog_id, "Card one", "First")
    board = repository.create_card("user", backlog_id, "Card two", "Second")
    assert [card["position"] for card in board["columns"][0]["cards"]] == [0, 1]

    first_card_id = board["columns"][0]["cards"][0]["id"]
    second_card_id = board["columns"][0]["cards"][1]["id"]

    board = repository.move_card("user", first_card_id, review_id, 0)
    assert [card["id"] for card in board["columns"][0]["cards"]] == [second_card_id]
    assert [card["position"] for card in board["columns"][0]["cards"]] == [0]
    assert [card["id"] for card in board["columns"][3]["cards"]] == [first_card_id]

    board = repository.delete_card("user", second_card_id)
    assert board["columns"][0]["cards"] == []


def test_repository_reorders_cards_within_same_column_without_constraint_errors(
    repository: KanbanRepository,
) -> None:
    board = repository.get_board("user")
    backlog_id = board["columns"][0]["id"]

    board = repository.create_card("user", backlog_id, "Card one", "First")
    board = repository.create_card("user", backlog_id, "Card two", "Second")
    first_card_id = board["columns"][0]["cards"][0]["id"]
    second_card_id = board["columns"][0]["cards"][1]["id"]

    board = repository.move_card("user", second_card_id, backlog_id, 0)

    assert [card["id"] for card in board["columns"][0]["cards"]] == [
        second_card_id,
        first_card_id,
    ]
    assert [card["position"] for card in board["columns"][0]["cards"]] == [0, 1]


def test_repository_moves_card_into_non_empty_column_without_constraint_errors(
    repository: KanbanRepository,
) -> None:
    board = repository.get_board("user")
    backlog_id = board["columns"][0]["id"]
    discovery_id = board["columns"][1]["id"]

    board = repository.create_card("user", backlog_id, "Backlog card", "A")
    board = repository.create_card("user", discovery_id, "Discovery card", "B")
    moved_card_id = board["columns"][0]["cards"][0]["id"]
    existing_target_card_id = board["columns"][1]["cards"][0]["id"]

    board = repository.move_card("user", moved_card_id, discovery_id, 0)

    assert [card["id"] for card in board["columns"][1]["cards"]] == [
        moved_card_id,
        existing_target_card_id,
    ]
    assert [card["position"] for card in board["columns"][1]["cards"]] == [0, 1]


def test_repository_moves_card_to_end_of_non_empty_column_without_constraint_errors(
    repository: KanbanRepository,
) -> None:
    board = repository.get_board("user")
    backlog_id = board["columns"][0]["id"]
    discovery_id = board["columns"][1]["id"]

    board = repository.create_card("user", backlog_id, "Backlog card", "A")
    board = repository.create_card("user", discovery_id, "Discovery card one", "B")
    board = repository.create_card("user", discovery_id, "Discovery card two", "C")
    moved_card_id = board["columns"][0]["cards"][0]["id"]

    board = repository.move_card("user", moved_card_id, discovery_id, 2)

    assert [card["title"] for card in board["columns"][1]["cards"]] == [
        "Discovery card one",
        "Discovery card two",
        "Backlog card",
    ]
    assert [card["position"] for card in board["columns"][1]["cards"]] == [0, 1, 2]


def test_repository_isolates_data_per_user(repository: KanbanRepository) -> None:
    first_board = repository.get_board("user")
    first_column_id = first_board["columns"][0]["id"]

    repository.create_card("user", first_column_id, "User card", "Owned by user")

    second_board = repository.get_board("another-user")
    assert all(column["cards"] == [] for column in second_board["columns"])

    refreshed_first_board = repository.get_board("user")
    assert refreshed_first_board["columns"][0]["cards"][0]["title"] == "User card"


def test_repository_returns_canonical_ai_board_context(
    repository: KanbanRepository,
) -> None:
    board = repository.get_board("user")
    backlog_id = board["columns"][0]["id"]
    review_id = board["columns"][3]["id"]

    repository.create_card("user", review_id, "Later card", "B")
    repository.create_card("user", backlog_id, "Earlier card", "A")

    context = repository.get_ai_board_context("user")

    assert list(context.keys()) == ["board"]
    ai_board = context["board"]
    assert ai_board["user_id"] == 1
    assert [column["position"] for column in ai_board["columns"]] == [0, 1, 2, 3, 4]
    assert ai_board["columns"][0]["cards"][0]["title"] == "Earlier card"
    assert ai_board["columns"][3]["cards"][0]["title"] == "Later card"


def test_repository_apply_ai_actions_supports_multi_step_updates(
    repository: KanbanRepository,
) -> None:
    board = repository.get_board("user")
    backlog_id = board["columns"][0]["id"]
    review_id = board["columns"][3]["id"]

    board = repository.create_card("user", backlog_id, "Ship API", "Draft")
    card_id = board["columns"][0]["cards"][0]["id"]

    updated = repository.apply_ai_actions(
        "user",
        [
            {"type": "rename_column", "column_id": backlog_id, "title": "Ideas"},
            {"type": "edit_card", "card_id": card_id, "details": "Ready"},
            {"type": "move_card", "card_id": card_id, "column_id": review_id, "position": 0},
        ],
    )

    assert updated["columns"][0]["title"] == "Ideas"
    assert updated["columns"][0]["cards"] == []
    assert updated["columns"][3]["cards"][0]["details"] == "Ready"


def test_repository_apply_ai_actions_rolls_back_on_failure(
    repository: KanbanRepository,
) -> None:
    board = repository.get_board("user")
    backlog_id = board["columns"][0]["id"]

    with pytest.raises(NotFoundError):
        repository.apply_ai_actions(
            "user",
            [
                {"type": "create_card", "column_id": backlog_id, "title": "Transient"},
                {"type": "delete_card", "card_id": 999999},
            ],
        )

    refreshed_board = repository.get_board("user")
    assert refreshed_board["columns"][0]["cards"] == []
