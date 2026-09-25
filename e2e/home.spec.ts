import { test, expect } from "@playwright/test";

test.describe("Public site - home page", () => {
  test("renders broker-first hero, primary CTA, and lead categories", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Request Insurance Leads/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Create Broker Account/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leads Across Multiple Insurance Products" })).toBeVisible();
  });

  test("footer exposes privacy notice, terms, and disclaimer", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Privacy Notice" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Use" })).toBeVisible();
    await expect(page.getByText(/does not provide insurance advice/i)).toBeVisible();
  });

  test("primary navigation sends new brokers to registration", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Create Broker Account" }).first().click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Create a broker account" })).toBeVisible();
  });

  test("legal pages render configurable placeholder text", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
  });
});
