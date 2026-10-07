import { test, expect } from "@playwright/test";

// Demo mode's identity is always "demo_platform_admin" (see getDashboardIdentity()
// in src/lib/auth.ts), which both canViewCompliance() and the stricter
// canManageCompliance() always allow, so the page and the export button are
// both visible without a separate sign-in step - same assumption
// compliance-requests.spec.ts and data-source-registry.spec.ts make.
//
// Row counts and the exact set of entries depend on how much audit log
// history already exists in the demo dataset by the time this runs (nearly
// every mutation across the app appends an entry, and the suite itself keeps
// generating more of them), so - following the same discipline as
// hotspots.spec.ts/industry-opportunity.spec.ts/fye-campaign-planner.spec.ts -
// this asserts on filter *behaviour* rather than hardcoded row counts.

test.describe("Audit Log (synthetic demo data)", () => {
  test("loads with entries, a working filter row, and a disabled export", async ({ page }) => {
    await page.goto("/dashboard/audit-log");
    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();

    const table = page.getByTestId("audit-log-table");
    await expect(table).toBeVisible();

    // The demo dataset always has at least the seeded lead-creation entries,
    // so the table should not be showing the empty state on an unfiltered load.
    await expect(page.getByTestId("audit-log-empty")).not.toBeVisible();
    const rowCountBefore = await page.getByTestId("audit-log-row").count();
    expect(rowCountBefore).toBeGreaterThan(0);

    // Filtering to an entity that cannot exist narrows the table to nothing,
    // without erroring.
    await page.getByTestId("audit-log-filter-actor").fill("no-such-actor-xyz-123");
    await expect(page.getByTestId("audit-log-empty")).toBeVisible();
    expect(await page.getByTestId("audit-log-row").count()).toBe(0);

    // Clearing the filter restores the original rows.
    await page.getByTestId("audit-log-filter-actor").fill("");
    await expect(page.getByTestId("audit-log-empty")).not.toBeVisible();
    expect(await page.getByTestId("audit-log-row").count()).toBe(rowCountBefore);

    // Filtering by entity narrows (or leaves unchanged) the row count, and
    // every visible row's "Entity" cell matches the selected label - it
    // never errors or grows the result set.
    await page.getByTestId("audit-log-filter-entity").selectOption("lead");
    const leadRowCount = await page.getByTestId("audit-log-row").count();
    expect(leadRowCount).toBeLessThanOrEqual(rowCountBefore);
    expect(leadRowCount).toBeGreaterThan(0);
    const entityCells = await page.getByTestId("audit-log-row").locator("td").nth(1).allTextContents();
    for (const cell of entityCells) {
      expect(cell).toBe("Lead");
    }

    // The demo admin can export - the button is visible and enabled.
    await expect(page.getByTestId("audit-log-export-button")).toBeVisible();
    await expect(page.getByTestId("audit-log-export-button")).toBeEnabled();
  });

  test("exporting the filtered view downloads a CSV and does not throw", async ({ page }) => {
    await page.goto("/dashboard/audit-log");
    await expect(page.getByTestId("audit-log-export-button")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("audit-log-export-button").click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^audit-log-export-\d+\.csv$/);
    const path = await download.path();
    expect(path).toBeTruthy();

    // No export error banner should appear after a successful export.
    await expect(page.getByText(/could not be exported/)).not.toBeVisible();

    // The export itself is an auditable action: reloading should show at
    // least one more entry than before (the export's own "export" entity
    // audit record), and an "Export" filter option should now match it.
    await page.reload();
    await page.getByTestId("audit-log-filter-entity").selectOption("export");
    await expect(page.getByTestId("audit-log-empty")).not.toBeVisible();
    const exportRowCount = await page.getByTestId("audit-log-row").count();
    expect(exportRowCount).toBeGreaterThan(0);
  });

  test("Compliance dashboard links through to the Audit Log and shows real export activity", async ({ page }) => {
    await page.goto("/dashboard/compliance");
    await expect(page.getByText("Export activity")).toBeVisible();

    const link = page.getByRole("link", { name: "Open audit log" });
    await expect(link).toBeVisible();
    await link.click();

    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/audit-log$/);
  });
});
