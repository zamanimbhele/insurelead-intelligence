import { test, expect } from "@playwright/test";

// Demo mode's identity is always "demo_platform_admin" (see getDashboardIdentity()
// in src/lib/auth.ts), which canManageCompliance() always allows, so the register/
// decide forms are visible without a separate sign-in step - same assumption
// compliance-requests.spec.ts makes.

test.describe("Data Source Registry (synthetic demo data)", () => {
  test("registering a data source and approving it", async ({ page }) => {
    await page.goto("/dashboard/data-sources");
    await expect(page.getByRole("heading", { name: "Data Source Registry" })).toBeVisible();

    const sourceName = `E2E Source ${Date.now()}`;
    await page.getByPlaceholder("e.g. Q4 trade show lead scans").fill(sourceName);
    await page.getByPlaceholder("Team or person accountable for it").fill("E2E Compliance Team");
    await page.getByPlaceholder(/Legitimate interest under a signed referral agreement/).fill("Signed referral partner agreement");
    await page.getByPlaceholder("What this source may be used for").fill("Business insurance lead follow-up");
    await page.getByRole("button", { name: "Register data source" }).click();

    const row = page.locator("li", { hasText: sourceName });
    await expect(row).toBeVisible();
    // "Pending review" is also the text of a (DOM-present) <option> inside the
    // same row's decision <select>, which a plain getByText also matches -
    // scope to the status badge's own testid, same pattern as
    // compliance-requests.spec.ts's DSR status assertions.
    await expect(row.getByTestId("data-source-status-badge")).toHaveText("Pending review");

    await row.getByRole("combobox").selectOption("approved");
    await row.getByLabel("Allow for marketing").check();
    await row.getByRole("button", { name: "Save decision" }).click();

    await expect(row.getByTestId("data-source-status-badge")).toHaveText("Approved");
    await expect(row.getByText("Marketing allowed")).toBeVisible();
  });

  test("a rejected data source cannot be allowed for marketing", async ({ page }) => {
    await page.goto("/dashboard/data-sources");

    const sourceName = `E2E Rejected Source ${Date.now()}`;
    await page.getByPlaceholder("e.g. Q4 trade show lead scans").fill(sourceName);
    await page.getByPlaceholder("Team or person accountable for it").fill("E2E Compliance Team");
    await page.getByPlaceholder(/Legitimate interest under a signed referral agreement/).fill("Unverified list purchase");
    await page.getByPlaceholder("What this source may be used for").fill("Pending legal review");
    await page.getByRole("button", { name: "Register data source" }).click();

    const row = page.locator("li", { hasText: sourceName });
    await expect(row).toBeVisible();

    await row.getByRole("combobox").selectOption("rejected");
    // The "allow for marketing" checkbox only renders for an approve/reinstate
    // decision - it must not be possible to grant marketing use alongside a
    // rejection.
    await expect(row.getByLabel("Allow for marketing")).toHaveCount(0);
    await row.getByRole("button", { name: "Save decision" }).click();

    await expect(row.getByTestId("data-source-status-badge")).toHaveText("Rejected");
    await expect(row.getByText("Marketing allowed")).toHaveCount(0);
  });

  test("Compliance dashboard summarises data source approval counts", async ({ page }) => {
    await page.goto("/dashboard/compliance");
    const card = page.getByTestId("data-source-registry-card");
    await expect(card.getByRole("link", { name: "Open registry" })).toBeVisible();
    await expect(card.getByTestId("data-source-pending-count")).toBeVisible();
  });
});
