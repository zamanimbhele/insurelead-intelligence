import { test, expect } from "@playwright/test";

// Demo mode defaults to the Super Admin ("platform_admin") account unless a
// different role is selected via the sidebar role switcher (see
// getDashboardIdentity() / DEFAULT_DEMO_ROLE in src/lib/auth.ts), which canManageCompliance() always allows, so these forms
// are visible without a separate sign-in step - same assumption compliance.spec.ts
// (if present) and lead-pipeline.spec.ts make.

test.describe("Opt-out and data subject requests (synthetic demo data)", () => {
  test("logging an opt-out request and marking it processed", async ({ page }) => {
    await page.goto("/dashboard/compliance");
    const optOutPanel = page.getByTestId("opt-out-requests-panel");
    await expect(optOutPanel.getByRole("heading", { name: "Opt-out requests" })).toBeVisible();

    const email = `opt-out-${Date.now()}@example.com`;
    await optOutPanel.getByPlaceholder("name@business.co.za").fill(email);
    await optOutPanel.getByRole("button", { name: "Log opt-out request" }).click();

    const row = optOutPanel.locator("li", { hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByText("New", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: "Mark processed" }).click();
    await expect(row.getByText("Processed", { exact: true })).toBeVisible();
  });

  test("logging a data subject access request and progressing its status", async ({ page }) => {
    await page.goto("/dashboard/compliance");
    const dsrPanel = page.getByTestId("data-subject-requests-panel");
    await expect(dsrPanel.getByRole("heading", { name: "Data subject requests" })).toBeVisible();

    const requesterEmail = `dsr-${Date.now()}@example.com`;
    const requesterName = `DSR Tester ${Date.now()}`;
    await dsrPanel.getByLabel("Requester name").fill(requesterName);
    await dsrPanel.getByLabel("Requester email").fill(requesterEmail);
    await dsrPanel.getByRole("button", { name: "Log data subject request" }).click();

    const row = dsrPanel.locator("li", { hasText: requesterName });
    await expect(row).toBeVisible();
    await expect(row.getByText("Received", { exact: true })).toBeVisible();

    // The status select defaults to "Verifying identity" for a freshly received
    // request (see DataSubjectRequestRow) - save it as-is to progress the request
    // without touching the destructive "completed" + deletion redaction path.
    // Scoped to the status badge's own testid: "Verifying identity" is also the
    // text of the (hidden, but still DOM-present) <option> inside the same row's
    // status <select>, which a plain getByText also matches.
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByTestId("dsr-status-badge")).toHaveText("Verifying identity");
  });

  test("a deletion request warns before it would redact a linked lead", async ({ page }) => {
    await page.goto("/dashboard/leads");
    const href = await page.locator("a[href^='/dashboard/leads/']").first().getAttribute("href");
    if (!href) throw new Error("Could not resolve a lead profile link from the Leads table");
    const leadId = href.split("/").pop();

    await page.goto("/dashboard/compliance");
    const dsrPanel = page.getByTestId("data-subject-requests-panel");
    const requesterEmail = `dsr-deletion-${Date.now()}@example.com`;
    const requesterName = `Deletion Tester ${Date.now()}`;
    await dsrPanel.getByLabel("Request type").selectOption("deletion");
    await dsrPanel.getByLabel("Lead ID").fill(leadId ?? "");
    await dsrPanel.getByLabel("Requester name").fill(requesterName);
    await dsrPanel.getByLabel("Requester email").fill(requesterEmail);
    await dsrPanel.getByRole("button", { name: "Log data subject request" }).click();

    const row = dsrPanel.locator("li", { hasText: requesterName });
    await expect(row).toBeVisible();

    // Select "Completed" but do not save - this is a one-way redaction and the
    // shared demo lead must stay intact for every other spec that relies on it.
    await row.getByRole("combobox").selectOption("completed");
    await expect(row.getByText(/will immediately redact the linked lead/)).toBeVisible();
  });
});
