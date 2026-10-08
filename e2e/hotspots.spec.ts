import { test, expect } from "@playwright/test";

// Demo mode defaults to the Super Admin ("platform_admin") account unless a
// different role is selected via the sidebar role switcher (see
// getDashboardIdentity() / DEFAULT_DEMO_ROLE in src/lib/auth.ts), which canManageCompliance() always allows, so the
// threshold-setting control is visible without a separate sign-in step - same
// assumption compliance.spec.ts and data-source-registry.spec.ts make.
//
// These tests run in file order against the committed synthetic seed data
// (data/leads.json, 66 leads across 6 provinces), where at the default
// minimum-lead threshold of 10: Free State (16), Western Cape (14),
// Gauteng (12) and Eastern Cape (10) clear the threshold and KwaZulu-Natal
// (6) and Mpumalanga (8) do not; no suburb reaches 10 leads, so the suburb
// table's honest-empty-state is itself part of what this feature promises.

test.describe("Geographic hotspot dashboard (synthetic demo data)", () => {
  test("shows province-level hotspots above the threshold and suppresses low-volume provinces", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence/hotspots");

    await expect(page.getByRole("heading", { name: "Geographic Hotspots" })).toBeVisible();
    await expect(page.getByText(/never shown above, at any level/)).toBeVisible();

    const provinceTable = page.getByTestId("hotspot-table-province");
    await expect(provinceTable.getByText("Free State", { exact: true })).toBeVisible();
    await expect(provinceTable.getByText("KwaZulu-Natal", { exact: true })).toHaveCount(0);

    // Every visible province row carries an opportunity score badge with a
    // hover explanation (title attribute), never a bare number with no
    // rationale - the same transparency rule the lead scoring engine
    // follows (see src/lib/scoring.ts).
    const scoreBadges = provinceTable.getByTestId("hotspot-score-province");
    await expect(scoreBadges.first()).toBeVisible();

    // Suburb level is honestly empty at the default threshold rather than
    // showing fabricated data.
    await expect(page.getByTestId("hotspot-empty-suburb")).toBeVisible();
  });

  test("lowering the minimum threshold reveals suburb-level hotspots, then restores the default", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence/hotspots");

    const thresholdCard = page.getByTestId("hotspot-threshold-card");
    const input = thresholdCard.getByLabel("Leads");
    await expect(input).toHaveValue("10");

    await input.fill("5");
    await thresholdCard.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/could not be updated/)).not.toBeVisible();

    await expect(page.getByTestId("hotspot-empty-suburb")).toHaveCount(0);
    await expect(page.getByTestId("hotspot-table-suburb").getByTestId("hotspot-score-suburb").first()).toBeVisible();

    // Restore the default so this test is not order-dependent with the one
    // above (or with a full-suite rerun of this file).
    await input.fill("10");
    await thresholdCard.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("hotspot-empty-suburb")).toBeVisible();
  });

  test("Market Intelligence page links through to the hotspot dashboard", async ({ page }) => {
    await page.goto("/dashboard/market-intelligence");
    await page.getByRole("link", { name: "Open Geographic Hotspots" }).click();
    await expect(page).toHaveURL(/\/dashboard\/market-intelligence\/hotspots$/);
    await expect(page.getByRole("heading", { name: "Geographic Hotspots" })).toBeVisible();
  });
});
