import { test, expect } from "@playwright/test";

// Demo mode defaults to the Super Admin ("platform_admin") account unless a
// different role is selected via the sidebar role switcher (see
// getDashboardIdentity() / DEFAULT_DEMO_ROLE in src/lib/auth.ts), which both canManageCampaignPlanning() and
// canUpdateLeadStatus() always allow, so every control on this page is
// reachable without a separate sign-in step - same assumption every other
// Market Intelligence e2e test in this suite makes.
//
// These tests run against the committed synthetic seed data (data/leads.json,
// 66 leads, 64 of them carrying a financialYearEndMonth). Lead volume per
// month and the February breakdown's sector/province counts are fixed facts
// of the committed data and stay true regardless of when this test runs.
// Whether a given month is currently flagged "Plan now" depends on today's
// date (a month inside the 90-day planning window), so - following the same
// discipline hotspots.spec.ts and industry-opportunity.spec.ts already
// apply to time-relative values - this suite never pins which months are
// highlighted, only the calendar's time-stable lead counts.

test.describe("Financial Year-End Campaign Planner (synthetic demo data)", () => {
  test("shows a 12-month calendar and a time-stable per-month breakdown", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence/fye-planner");

    await expect(page.getByRole("heading", { name: "Financial Year-End Campaign Planner" })).toBeVisible();

    const grid = page.getByTestId("fye-calendar-grid");
    await expect(grid.getByTestId("fye-month-December")).toContainText("16 leads");
    await expect(grid.getByTestId("fye-month-January")).toContainText("0 leads");

    await grid.getByTestId("fye-month-February").click();

    const breakdown = page.getByTestId("fye-breakdown-panel");
    await expect(breakdown).toContainText("16 leads");
    await expect(breakdown).toContainText("67%");
    await expect(breakdown).toContainText("Technology and IT Services");
  });

  test("creates broker follow-up tasks for every eligible lead in the selected month", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence/fye-planner");
    await page.getByTestId("fye-calendar-grid").getByTestId("fye-month-February").click();

    await page.getByTestId("fye-followup-button").click();
    await expect(page.getByTestId("fye-followup-result")).toContainText("Created 15 of 15 eligible leads");
  });

  test("creates a campaign plan and moves it through its status lifecycle", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence/fye-planner");

    const form = page.getByTestId("fye-plan-form");
    await form.getByLabel("Title").fill("E2E FYE push");
    await page.getByRole("button", { name: "Create plan" }).click();

    const planList = page.getByTestId("fye-plan-list");
    const planItem = planList.locator('[data-testid^="fye-plan-"]').filter({ hasText: "E2E FYE push" });
    await expect(planItem).toBeVisible();
    await expect(planItem.getByText("Planned", { exact: true })).toBeVisible();

    await planItem.getByRole("button", { name: "Mark active" }).click();
    await expect(planItem.getByText("Active", { exact: true })).toBeVisible();

    await planItem.getByRole("button", { name: "Mark completed" }).click();
    await expect(planItem.getByText("Completed", { exact: true })).toBeVisible();
  });

  test("Market Intelligence page links through to the FYE campaign planner", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence");
    await page.getByRole("link", { name: "Open FYE Campaign Planner" }).click();
    await expect(page).toHaveURL(/\/dashboard\/market-intelligence\/fye-planner$/);
    await expect(page.getByRole("heading", { name: "Financial Year-End Campaign Planner" })).toBeVisible();
  });
});
