import { test, expect } from "@playwright/test";
test("lead marketplace shows approved pilot buyers", async ({ page }) => {
  await page.goto("/dashboard/marketplace");
  await expect(page.getByRole("heading", { name: "Lead Marketplace" })).toBeVisible();

  const pilotBuyers = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Pilot buyers" }),
  });

  await expect(pilotBuyers.getByText("Gauteng Commercial Broker Pilot", { exact: true })).toBeVisible();
  await expect(pilotBuyers.getByText("National SME Insurance Pilot", { exact: true })).toBeVisible();
});
