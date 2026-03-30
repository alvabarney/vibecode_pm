import { getMoveDestination, type BoardData } from "@/lib/kanban";

describe("getMoveDestination", () => {
  const board: BoardData = {
    id: 1,
    name: "My Board",
    userId: 1,
    columns: [
      {
        id: 10,
        slug: "backlog",
        title: "Backlog",
        position: 0,
        cards: [
          { id: 1, title: "Card one", details: "First", position: 0 },
          { id: 2, title: "Card two", details: "Second", position: 1 },
        ],
      },
      {
        id: 20,
        slug: "review",
        title: "Review",
        position: 1,
        cards: [{ id: 3, title: "Card three", details: "Third", position: 0 }],
      },
    ],
  };

  it("reorders cards in the same column", () => {
    expect(getMoveDestination(board, "card-2", "card-1")).toEqual({
      columnId: 10,
      position: 0,
    });
  });

  it("moves cards to another column before a card", () => {
    expect(getMoveDestination(board, "card-2", "card-3")).toEqual({
      columnId: 20,
      position: 0,
    });
  });

  it("drops cards to the end of a column", () => {
    expect(getMoveDestination(board, "card-1", "column-20")).toEqual({
      columnId: 20,
      position: 1,
    });
  });
});
