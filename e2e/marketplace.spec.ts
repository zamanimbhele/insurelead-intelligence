import { test, expect } from "@playwright/test";
test("lead marketplace shows approved pilot buyers", async ({ page }) => {
  await page.goto("/dashboard/marketplace");
  await expect(page.getByRole("heading", { name: "Lead Marketplace" })).toBeVisible();
  await expect(page.getByText("Gauteng Commercial Broker Pilot")).toBeVisible();
  await expect(page.getByText("National SME Insurance Pilot")).toBeVisible();
});
