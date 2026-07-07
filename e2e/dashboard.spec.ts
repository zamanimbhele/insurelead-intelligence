import { test, expect } from "@playwright/test";

test.describe("Internal broker dashboard (synthetic demo data)", () => {
  test("overview shows key widgets and the recent leads table", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Lead Management Overview" })).toBeVisible();

    // Stat cards are targeted by data-testid rather than visible text: the
    // leads table's status filter <select> below also lists every status
    // label (including "Do Not Contact") as an <option>, so text-based
    // locators are ambiguous - they hit two elements and fail Playwright's
    // strict-mode check immediately.
    await expect(page.getByTestId("stat-new-today")).toBeVisible();
    await expect(page.getByTestId("stat-needs-follow-up")).toBeVisible();
    await expect(page.getByTestId("stat-do-not-contact")).toBeVisible();

    await expect(page.getByText("Recent Leads")).toBeVisible();
  });

  test("leads list is searchable and links through to a lead detail page", async ({ page }) => {
    await page.goto("/dashboard/leads");

    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();

    const firstLeadLink = page.locator('table a[href^="/dashboard/leads/lead_"]').first();
    await expect(firstLeadLink).toBeVisible();
    const businessName = (await firstLeadLink.textContent())?.trim();

    await firstLeadLink.click();
    await expect(page).toHaveURL(/\/dashboard\/leads\/lead_/);
    if (businessName) {
      await expect(page.getByRole("heading", { name: businessName })).toBeVisible();
    }

    // Lead profile surfaces the transparent scoring explanation required by
    // the platform's compliance rules (no black-box automated decisions).
    await expect(page.getByRole("heading", { name: "Lead Score Explanation" })).toBeVisible();
    await expect(page.getByText(/for internal prioritisation only/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contact Person" })).toBeVisible();
  });

  test("market intelligence shows aggregated, threshold-gated charts", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence");

    await expect(page.getByRole("heading", { name: "Market Intelligence" })).toBeVisible();
    await expect(page.getByText(/minimum data threshold/i)).toBeVisible();
    await expect(page.getByText("Lead Volume by Industry")).toBeVisible();
    await expect(page.getByText("Lead Volume by Province")).toBeVisible();
  });
});
