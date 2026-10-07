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

    // Export activity is now a real widget backed by the audit log, not a
    // placeholder - see audit-log.spec.ts for the full Audit Log page. No
    // "Planned"/"Not yet available" placeholders remain on this dashboard
    // any more (the opt-out/data-subject-request workflow and the Data
    // Source Registry were both already real - see below and
    // data-source-registry.spec.ts).
    await expect(page.getByText("Not yet available")).not.toBeVisible();
    await expect(page.getByText("Planned")).toHaveCount(0);
    await expect(page.getByText("Export activity")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open audit log" })).toBeVisible();
    // Either "No exports have been made yet." or a real "<n> export(s)
    // logged" sentence - never hardcode which, since this grows with every
    // audit-log export triggered across local/CI runs.
    await expect(page.getByText(/No exports have been made yet\.|exports? logged/)).toBeVisible();

    // Data Source Registry summary: a real pending/approved/rejected/
    // suspended count, not a placeholder, linking through to the full
    // registry at /dashboard/data-sources.
    const dataSourceCard = page.getByTestId("data-source-registry-card");
    await expect(page.getByText("Data source approvals")).toBeVisible();
    await expect(dataSourceCard.getByRole("link", { name: "Open registry" })).toBeVisible();

    // Opt-out and data subject request workflow: stat cards plus both panels.
    // Scoped to each panel's testid - "Data subject requests" alone is
    // ambiguous (it's also in the "Open Data Subject Requests" stat label and
    // the section's own h2).
    await expect(page.getByTestId("stat-new-opt-outs")).toBeVisible();
    await expect(page.getByTestId("stat-data-subject-requests")).toBeVisible();
    await expect(page.getByTestId("opt-out-requests-panel").getByRole("heading", { name: "Opt-out requests" })).toBeVisible();
    await expect(
      page.getByTestId("data-subject-requests-panel").getByRole("heading", { name: "Data subject requests" }),
    ).toBeVisible();
  });

  test("a platform/compliance admin can change the retention threshold and it persists", async ({ page }) => {
    await page.goto("/dashboard/compliance");

    // Scoped to the retention card's own testid: a plain
    // getByRole("button", { name: "Save" }) is ambiguous once any opt-out or
    // data subject request rows exist, since each open row has its own Save
    // button (see ComplianceRequestsPanel.tsx).
    const retentionCard = page.getByTestId("retention-setting-card");
    const input = retentionCard.getByLabel("Days");
    await expect(input).toBeVisible();
    const originalValue = await input.inputValue();
    const nextValue = String(Number(originalValue) === 365 ? 400 : 365);

    await input.fill(nextValue);
    await retentionCard.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/could not be updated/)).not.toBeVisible();

    await page.reload();
    await expect(page.getByTestId("retention-setting-card").getByLabel("Days")).toHaveValue(nextValue);
    await expect(page.getByRole("heading", { name: "Retention exceptions" })).toBeVisible();

    // Revert so the demo dataset is unchanged for the next local run.
    const retentionCardAfterReload = page.getByTestId("retention-setting-card");
    await retentionCardAfterReload.getByLabel("Days").fill(originalValue);
    await retentionCardAfterReload.getByRole("button", { name: "Save" }).click();
    await page.reload();
    await expect(page.getByTestId("retention-setting-card").getByLabel("Days")).toHaveValue(originalValue);
  });
});
