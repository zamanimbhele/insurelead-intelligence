import { test, expect } from "@playwright/test";

test.describe("Public site - home page", () => {
  test("renders hero, primary CTA, and cover categories", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Insurance Options for Every Stage/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Find Insurance Options" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cover for Individuals and Businesses" })).toBeVisible();
  });

  test("footer exposes privacy notice, terms, and disclaimer", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Privacy Notice" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Use" })).toBeVisible();
    await expect(page.getByText(/does not create insurance cover/i)).toBeVisible();
  });

  test("primary navigation reaches the consultation form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Find Insurance Options" }).first().click();

    await expect(page).toHaveURL(/\/consultation$/);
    await expect(page.getByRole("heading", { name: "Find Insurance Options" })).toBeVisible();
  });

  test("legal pages render configurable placeholder text", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
  });
});
