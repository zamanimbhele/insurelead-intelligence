import { expect, test } from "@playwright/test";

test.describe("Multi-broker tenancy workspace", () => {
  test("platform oversight shows separate broker appetite and delivery readiness", async ({ page }) => {
    await page.goto("/dashboard/brokers");

    await expect(page.getByRole("heading", { name: "Broker Directory" })).toBeVisible();
    await expect(page.getByTestId("broker-card")).toHaveCount(3);
    await expect(page.getByText("Gauteng Commercial Broker Pilot", { exact: true })).toBeVisible();
    await expect(page.getByText("Personal Lines Broker Pilot", { exact: true })).toBeVisible();
    await expect(page.getByText("15 leads/day", { exact: true })).toBeVisible();
    await expect(page.getByText("2h", { exact: true })).toBeVisible();
    await expect(page.getByText("insurance@personal-lines.example-synthetic.co.za", { exact: true })).toBeVisible();
  });

  test("allocation workspace renders independently from marketplace inventory", async ({ page }) => {
    await page.goto("/dashboard/allocations");
    await expect(page.getByRole("heading", { name: "Lead Allocations" })).toBeVisible();
    await expect(page.getByText("Allocation queue", { exact: true })).toBeVisible();
    await expect(page.getByText("No lead allocations are available.", { exact: true })).toBeVisible();
  });
});
