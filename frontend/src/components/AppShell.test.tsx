import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/AppShell";

const mockFetch = vi.fn();
const boardResponse = {
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

describe("AppShell", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the login form when the session is unauthenticated", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: false, username: null }),
    });

    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Kanban Studio" })).not.toBeInTheDocument();
  });

  it("logs in successfully and shows the kanban board", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, username: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => boardResponse,
      });

    render(<AppShell />);

    await screen.findByRole("heading", { name: "Sign in" });
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  it("logs out and returns to the login form", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => boardResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, username: null }),
      });

    render(<AppShell />);

    await screen.findByRole("heading", { name: "Kanban Studio" });
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  });
});
