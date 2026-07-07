import { test, expect } from "@playwright/test";

test.describe("Public site - home page", () => {
  test("renders hero, primary CTA, and cover categories", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Protect Your Business With Insurance/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a Consultation" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Business Insurance Solutions" })).toBeVisible();
  });

  test("footer exposes privacy notice, terms, and disclaimer", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Privacy Notice" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Use" })).toBeVisible();
    await expect(page.getByText(/does not create insurance cover/i)).toBeVisible();
  });

  test("primary navigation reaches the consultation form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Request a Consultation" }).first().click();

    await expect(page).toHaveURL(/\/consultation$/);
    await expect(page.getByRole("heading", { name: "Request a Business Insurance Consultation" })).toBeVisible();
  });

  test("legal pages render configurable placeholder text", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
  });
});
