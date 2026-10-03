import { test, expect } from "@playwright/test";

test.describe("Compliance dashboard (synthetic demo data)", () => {
  test("shows consent, outreach, assignment and retention widgets", async ({ page }) => {
    await page.goto("/dashboard/compliance");

    await expect(page.getByRole("heading", { name: "Compliance", exact: true })).toBeVisible();

    await expect(page.getByTestId("stat-consent-coverage")).toBeVisible();
    await expect(page.getByTestId("stat-invalid-consent")).toBeVisible();
    await expect(page.getByTestId("stat-do-not-contact")).toBeVisible();
    await expect(page.getByTestId("stat-unassigned")).toBeVisible();
    await expect(page.getByTestId("stat-retention-exceptions")).toBeVisible();

    // The demo identity is always a platform admin, so consent coverage
    // should read as a percentage, not leak a NaN/undefined from a division
    // by zero or a bad lookup.
    await expect(page.getByTestId("stat-consent-coverage")).toContainText("%");

    // Scoped to the heading role: "retention exceptions" (case-insensitive
    // substring match, Playwright's getByText default) also appears inside
    // the retention-threshold card's own description sentence below, so a
    // plain getByText on these headings is ambiguous.
    await expect(page.getByRole("heading", { name: "Leads without valid consent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Unassigned leads" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Retention exceptions" })).toBeVisible();

    // Three widgets genuinely aren't built yet (Data Source Registry,
    // audited exports, DSR workflow) - the dashboard says so rather than
    // faking the data, and this guards against someone silently papering
    // over that with mock numbers later.
    await expect(page.getByText("Not yet available")).toBeVisible();
    await expect(page.getByText("Data source approvals")).toBeVisible();
    await expect(page.getByText("Export activity")).toBeVisible();
    await expect(page.getByText("Data subject requests")).toBeVisible();
    await expect(page.getByText("Planned")).toHaveCount(3);
  });

  test("a platform/compliance admin can change the retention threshold and it persists", async ({ page }) => {
    await page.goto("/dashboard/compliance");

    const input = page.getByLabel("Days");
    await expect(input).toBeVisible();
    const originalValue = await input.inputValue();
    const nextValue = String(Number(originalValue) === 365 ? 400 : 365);

    await input.fill(nextValue);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/could not be updated/)).not.toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Days")).toHaveValue(nextValue);
    await expect(page.getByRole("heading", { name: "Retention exceptions" })).toBeVisible();

    // Revert so the demo dataset is unchanged for the next local run.
    await page.getByLabel("Days").fill(originalValue);
    await page.getByRole("button", { name: "Save" }).click();
    await page.reload();
    await expect(page.getByLabel("Days")).toHaveValue(originalValue);
  });
});
