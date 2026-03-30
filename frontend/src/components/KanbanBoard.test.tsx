import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const mockFetch = vi.fn();

const emptyBoard = {
  id: 1,
  name: "My Board",
  userId: 1,
  columns: [
    { id: 1, slug: "backlog", title: "Backlog", position: 0, cards: [] },
    { id: 2, slug: "discovery", title: "Discovery", position: 1, cards: [] },
    { id: 3, slug: "in_progress", title: "In Progress", position: 2, cards: [] },
    { id: 4, slug: "review", title: "Review", position: 3, cards: [] },
    { id: 5, slug: "done", title: "Done", position: 4, cards: [] },
  ],
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders five persisted columns", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => emptyBoard,
    });

    render(<KanbanBoard />);

    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column through the API", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyBoard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...emptyBoard,
          columns: [{ ...emptyBoard.columns[0], title: "New Name" }, ...emptyBoard.columns.slice(1)],
        }),
      });

    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();

    expect(await within(column).findByDisplayValue("New Name")).toBeVisible();
  });

  it("adds and removes a persisted card", async () => {
    const boardWithCard = {
      ...emptyBoard,
      columns: [
        {
          ...emptyBoard.columns[0],
          cards: [{ id: 42, title: "New card", details: "Notes", position: 0 }],
        },
        ...emptyBoard.columns.slice(1),
      ],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyBoard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => boardWithCard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyBoard,
      });

    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("renders assistant messages from the chat sidebar", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyBoard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assistant_message: "2+2 is 4.",
          kanban_actions: [],
        }),
      });

    render(<KanbanBoard />);

    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.type(
      screen.getByLabelText("Message"),
      "What is 2+2? Reply briefly."
    );
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("2+2 is 4.")).toBeVisible();
    expect(screen.getByText("What is 2+2? Reply briefly.")).toBeVisible();
  });

  it("refreshes the board when AI returns an updated board snapshot", async () => {
    const boardWithAiCard = {
      ...emptyBoard,
      columns: [
        {
          ...emptyBoard.columns[0],
          cards: [
            {
              id: 88,
              title: "AI created card",
              details: "Created from chat",
              position: 0,
            },
          ],
        },
        ...emptyBoard.columns.slice(1),
      ],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyBoard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assistant_message: "I added a new card to Backlog.",
          kanban_actions: [
            {
              type: "create_card",
              column_id: 1,
              title: "AI created card",
              details: "Created from chat",
            },
          ],
          board: boardWithAiCard,
        }),
      });

    render(<KanbanBoard />);

    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.type(
      screen.getByLabelText("Message"),
      "Create a backlog card called AI created card."
    );
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    const firstColumn = (await screen.findAllByTestId(/column-/i))[0];
    expect(await within(firstColumn).findByText("AI created card")).toBeVisible();
  });

  it("shows chat errors without mutating the board", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => emptyBoard,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({
          error: "ai_request_failed",
          details: "Provider is busy right now.",
        }),
      });

    render(<KanbanBoard />);

    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.type(screen.getByLabelText("Message"), "Create a card");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText("Provider is busy right now.")).toBeVisible();
    });
    expect(screen.getByLabelText("Message")).toHaveValue("Create a card");
    const firstColumn = (await screen.findAllByTestId(/column-/i))[0];
    expect(within(firstColumn).queryByText("AI created card")).not.toBeInTheDocument();
  });
});
