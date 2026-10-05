import { test, expect } from "@playwright/test";

// Demo mode's identity is always "demo_platform_admin" (see getDashboardIdentity()
// in src/lib/auth.ts), which canManageCompliance() always allows, so the
// threshold-setting control on the hotspots page is reachable without a
// separate sign-in step - same assumption hotspots.spec.ts makes.
//
// These tests run against the committed synthetic seed data (data/leads.json,
// 66 leads). At the default minimum-lead threshold of 10, only "Retail and
// E-commerce" (12 leads) clears the threshold; "Healthcare and Wellness" (9
// leads) does not. Lead volume, conversion rate (won/lost counts) and each
// industry's most-requested cover need are all fixed facts of the committed
// data and stay true regardless of when this test runs. Growth rate and the
// exact "renewing soon" count are time-relative (computed against "now"), so
// this suite deliberately never pins their values - only their format - the
// same discipline hotspots.spec.ts applies to growth and conversion.

test.describe("Industry opportunity dashboard (synthetic demo data)", () => {
  test("shows industries above the threshold and suppresses low-volume industries", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence/industries");

    await expect(page.getByRole("heading", { name: "Industry Opportunity" })).toBeVisible();
    await expect(page.getByText(/never shown below/)).toBeVisible();

    const table = page.getByTestId("industry-table");
    await expect(table.getByText("Retail and E-commerce", { exact: true })).toBeVisible();
    await expect(table.getByText("Healthcare and Wellness", { exact: true })).toHaveCount(0);

    // Every visible row carries a transparent opportunity score badge.
    await expect(page.getByTestId("industry-opportunity-score").first()).toBeVisible();

    // Highest volume callout always has data once any industry clears the threshold.
    await expect(page.getByText("Highest volume")).toBeVisible();
  });

  test("lowering the shared minimum threshold reveals more industries, then restores the default", async ({ page }) => {
    // The threshold is edited on the hotspots page only; the industries page
    // just reads application_settings.hotspot_min_lead_threshold.
    await page.goto("/dashboard/market-intelligence/hotspots");
    const thresholdCard = page.getByTestId("hotspot-threshold-card");
    const input = thresholdCard.getByLabel("Leads");
    await expect(input).toHaveValue("10");
    await input.fill("5");
    await thresholdCard.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/could not be updated/)).not.toBeVisible();

    await page.goto("/dashboard/market-intelligence/industries");
    const table = page.getByTestId("industry-table");
    await expect(table.getByText("Healthcare and Wellness", { exact: true })).toBeVisible();

    // Healthcare and Wellness has 7 of its 9 leads carrying a renewal month
    // (a fixed fact of the committed data) - the "renewing soon" cell always
    // renders as "<n> of 7" rather than the empty-state message.
    const healthcareRow = table.locator("tr", { hasText: "Healthcare and Wellness" });
    await expect(healthcareRow.getByText(/of 7$/)).toBeVisible();

    // Professional Services has zero won leads among its closed leads, so it
    // is permanently flagged for marketing attention regardless of when this
    // test runs.
    const professionalRow = table.locator("tr", { hasText: "Professional Services" });
    await expect(professionalRow.getByTestId("industry-attention-flag")).toBeVisible();

    // Restore the default so this test is not order-dependent with the one above.
    await page.goto("/dashboard/market-intelligence/hotspots");
    await input.fill("10");
    await thresholdCard.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("hotspot-empty-suburb")).toBeVisible();
  });

  test("Market Intelligence page links through to the industry opportunity dashboard", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence");
    await page.getByRole("link", { name: "Open Industry Opportunity" }).click();
    await expect(page).toHaveURL(/\/dashboard\/market-intelligence\/industries$/);
    await expect(page.getByRole("heading", { name: "Industry Opportunity" })).toBeVisible();
  });
});
