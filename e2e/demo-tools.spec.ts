import { test, expect } from "@playwright/test";

// Demo mode defaults to the Super Admin ("platform_admin") account unless a
// different role is selected via the sidebar role switcher (see
// getDashboardIdentity() / DEFAULT_DEMO_ROLE in src/lib/auth.ts). Every
// Playwright test gets its own isolated browser context (a fresh cookie
// jar) by default, so a role switch made inside one test never leaks into
// another test or file - no cleanup/reset-to-admin step is needed at the
// end of a test here.
//
// Deliberately does NOT submit the "Reset demo data" form for real: this
// suite runs serially against one shared data/leads.json (see
// playwright.config.ts's own comment on why), and every other spec file
// in this suite either relies on the committed synthetic seed data or
// creates its own leads it expects to find later in the same run. Actually
// resetting demo data mid-suite would silently wipe or renumber state
// other tests depend on, trading one feature's coverage for a flaky whole
// suite - a worse outcome than leaving the success path to manual/CI
// verification (see BACKLOG.md's "Demo accounts and demo data reset" item
// for how resetDemoData() was verified instead: an isolated script,
// independent of this suite's shared state). What is tested here instead:
// the confirmation-mismatch path (safe - resetDemoData() is never called),
// and that the role switcher actually changes what is reachable, which is
// the point of the feature.
test.describe("Demo role switcher and Demo Tools (synthetic demo data)", () => {
  test("the default demo identity is Super Admin, with full nav and Demo Tools access", async ({ page }) => {
    await page.goto("/dashboard");

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Compliance" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Demo Tools" })).toBeVisible();

    const roleSelect = page.getByLabel("Viewing as (demo role)");
    await expect(roleSelect).toHaveValue("platform_admin");

    await nav.getByRole("link", { name: "Demo Tools" }).click();
    await expect(page.getByRole("heading", { name: "Demo Tools", exact: true })).toBeVisible();

    const superAdminRow = page.getByRole("row", { name: /Super Admin/ });
    await expect(superAdminRow).toContainText("Current");
    await expect(superAdminRow).toContainText("Thandiwe Mokoena");

    // All 6 seeded accounts are listed, not just the current one. Matched
    // by email (each cell holds only that text, and no account's email is
    // a prefix of another's - "Broker" vs "Broker Manager" the labels
    // would be) rather than by role label, which would otherwise make
    // "Broker" ambiguously match both the Broker and Broker Manager rows.
    for (const email of [
      "demo.superadmin@example-synthetic.co.za",
      "demo.complianceadmin@example-synthetic.co.za",
      "demo.complianceauditor@example-synthetic.co.za",
      "demo.brokermanager@example-synthetic.co.za",
      "demo.marketinganalyst@example-synthetic.co.za",
      "demo.broker@example-synthetic.co.za",
    ]) {
      await expect(page.getByRole("cell", { name: email, exact: true })).toBeVisible();
    }

    await expect(page.getByRole("button", { name: "Reset demo data" })).toBeVisible();
  });

  test("switching to a non-admin demo role hides compliance nav and Demo Tools, and restricts the page directly", async ({ page }) => {
    await page.goto("/dashboard");

    const roleSelect = page.getByLabel("Viewing as (demo role)");
    await roleSelect.selectOption("broker_agent");
    await expect(page).toHaveURL(/\/dashboard$/);

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Compliance" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Data Sources" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Legal Content" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Audit Log" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Demo Tools" })).toHaveCount(0);
    // A Broker is a broker user, so this link should still appear.
    await expect(nav.getByRole("link", { name: "Broker Profile" })).toBeVisible();

    // Direct navigation to a compliance page redirects away rather than
    // silently rendering restricted content.
    await page.goto("/dashboard/compliance");
    await expect(page).toHaveURL(/\/access-denied$/);

    // Demo Tools itself shows its own restricted message rather than a
    // redirect, matching the brokers/marketplace page convention.
    await page.goto("/dashboard/demo-tools");
    await expect(page.getByText("restricted to the Super Admin demo account")).toBeVisible();

    // Switching back to Super Admin restores access - the switch is not
    // one-way.
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("platform_admin");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Demo Tools" })).toBeVisible();
  });

  test("the reset form re-checks the confirmation phrase server-side without resetting anything", async ({ page }) => {
    await page.goto("/dashboard/demo-tools");

    const confirmationInput = page.getByLabel("Type RESET to confirm");
    // Bypasses the input's own pattern="RESET" client-side HTML validation
    // on purpose, so this exercises resetDemoDataAction()'s own
    // server-side re-check (formData.get("confirmation") !== "RESET"),
    // not just the browser's constraint validation.
    await confirmationInput.evaluate((el: HTMLInputElement) => { el.removeAttribute("pattern"); el.removeAttribute("required"); });
    await confirmationInput.fill("reset");
    await page.getByRole("button", { name: "Reset demo data" }).click();

    await expect(page).toHaveURL(/\/dashboard\/demo-tools\?error=confirmation$/);
    await expect(page.getByText("you must type RESET exactly to confirm")).toBeVisible();
  });
});
