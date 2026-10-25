import { expect, test } from "@playwright/test";

// Email links must survive mail security scanners, which open (GET) every
// link: opening a link only shows a button; nothing is used up until the
// person presses it.
test.describe("Email links and mail scanners", () => {
  test("opening a signup link shows a confirm button instead of using the token", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=abc123&type=signup");
    await expect(page).toHaveURL(/\/auth\/continue\?token_hash=abc123&type=signup/);
    await expect(page.getByRole("heading", { name: "Confirm your email address" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm my email" })).toBeVisible();
  });

  test("reset and invitation links get their own wording", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=abc123&type=recovery");
    await expect(page.getByRole("button", { name: "Choose a new password" })).toBeVisible();
    await page.goto("/auth/confirm?token_hash=abc123&type=invite");
    await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  });

  test("an unknown link type is refused", async ({ page }) => {
    await page.goto("/auth/continue?token_hash=abc123&type=magic");
    await expect(page).toHaveURL(/\/login\?error=confirmation_failed/);
    await expect(page.getByText("already been used or has expired")).toBeVisible();
  });
});
