import { expect, test } from "@playwright/test";

test("campaign workspace separates broker-owned, product-specific drafts from delivery", async ({ page }) => {
  await page.goto("/dashboard/campaigns");

  await expect(page.getByRole("heading", { name: "Campaign Orchestration" })).toBeVisible();
  await expect(page.getByTestId("campaign-card")).toHaveCount(2);
  await expect(page.getByText("Spring motor cover review", { exact: true })).toBeVisible();
  await expect(page.getByText("SME renewal readiness", { exact: true })).toBeVisible();
  await expect(page.getByText("Personal Lines Broker Pilot", { exact: true })).toBeVisible();
  await expect(page.getByText("National SME Insurance Pilot", { exact: true })).toBeVisible();
  await expect(page.getByText("Motor Insurance", { exact: true })).toBeVisible();
  await expect(page.getByText("Business Insurance", { exact: true })).toBeVisible();
  await expect(page.getByText(/Generation, approval, and delivery remain separate audited actions/i)).toBeVisible();
});
