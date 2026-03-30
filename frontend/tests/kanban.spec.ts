import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test("requires login before showing the kanban board", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});

test("allows logout after login", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("persists board changes after reload", async ({ page }) => {
  await login(page);

  const suffix = uniqueSuffix();
  const renamedColumn = `Backlog ${suffix}`;
  const cardTitle = `Playwright card ${suffix}`;
  const cardDetails = `Added via e2e ${suffix}`;

  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const titleInput = firstColumn.getByLabel("Column title");
  await titleInput.fill(renamedColumn);
  await titleInput.blur();
  await expect(titleInput).toHaveValue(renamedColumn);

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(cardTitle);
  await firstColumn.getByPlaceholder("Details").fill(cardDetails);
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(cardTitle)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]').nth(0).getByLabel("Column title")).toHaveValue(
    renamedColumn
  );
  await expect(page.locator('[data-testid^="column-"]').nth(0).getByText(cardTitle)).toBeVisible();
});

test("shows AI chat responses and AI-driven board updates", async ({ page }) => {
  test.skip(process.env.PM_RUN_LIVE_AI_TEST !== "1", "Requires live AI access.");

  await login(page);

  const suffix = uniqueSuffix();
  const aiCardTitle = `AI sidebar card ${suffix}`;

  await page.getByLabel("Message").fill(
    `Create a new card in the Backlog column titled "${aiCardTitle}" with details "Created from the AI sidebar test." Reply briefly.`
  );
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText(/I|Created|Added|Backlog/i).first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('[data-testid^="column-"]').nth(0).getByText(aiCardTitle)).toBeVisible({
    timeout: 30000,
  });
});
