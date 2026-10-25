import { expect, test, type Page } from "@playwright/test";

// Per-person authorisation (phase 3) in demo mode. The solo advisor is
// seeded as verified for life and funeral cover, with an investments
// claim awaiting review.
async function viewAs(page: Page, account: string, displayName: string) {
  await page.goto("/dashboard");
  await page.getByLabel("Viewing as (demo role)").selectOption(account);
  await expect(page.getByText(displayName).first()).toBeVisible();
}

test.describe("Authorisations (synthetic demo data)", () => {
  test("an advisor sees what they are authorised for, with placeholder guidance", async ({ page }) => {
    await viewAs(page, "solo_advisor", "Lerato Ndlovu");
    await page.goto("/dashboard/broker-profile");
    const section = page.getByTestId("authorisations-section");
    await expect(section.getByTestId("authorisation-long_term_insurance")).toContainText("Authorised");
    await expect(section.getByTestId("authorisation-long_term_insurance")).toContainText("Example Life Financial Services (demo)");

    const form = page.getByTestId("authorisation-form");
    await form.getByLabel("Product category").selectOption("medical_schemes");
    await expect(form.getByTestId("evidence-guidance")).toContainText("Placeholder guidance");
    await expect(form.getByTestId("evidence-guidance")).toContainText("Council for Medical Schemes");
    // Medical aid accepts only CMS accreditation, so it is preselected.
    await expect(form.getByLabel("Evidence")).toHaveValue("cms_accreditation");
  });

  test("a claim goes to the admin queue, and a rejection needs a reason the advisor sees", async ({ page }) => {
    await viewAs(page, "solo_advisor", "Lerato Ndlovu");
    await page.goto("/dashboard/broker-profile");
    const form = page.getByTestId("authorisation-form");
    await form.getByLabel("Product category").selectOption("short_term_insurance");
    await form.getByLabel("Evidence").selectOption("fsp_licence");
    await form.getByLabel("FSP licence number").fill("FSP-E2E-555");
    await form.getByRole("button", { name: "Submit for review" }).click();
    await expect(form.getByRole("status")).toContainText("Recorded");
    await expect(page.getByTestId("authorisation-short_term_insurance")).toContainText("Awaiting review");

    await viewAs(page, "platform_admin", "Thandiwe Mokoena");
    await page.goto("/dashboard/authorisations");
    const row = page.getByTestId("authorisations-pending").getByTestId("authorisation-row").filter({ hasText: "FSP-E2E-555" });
    await row.getByRole("button", { name: "Reject" }).click();
    await expect(row.getByRole("alert")).toContainText("Give a reason the holder will see");
    await row.getByLabel("Reason (needed to reject)").fill("Licence number not found on the FSCA register");
    await row.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByTestId("authorisations-closed")).toContainText("FSP-E2E-555");

    await viewAs(page, "solo_advisor", "Lerato Ndlovu");
    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("authorisation-short_term_insurance")).toContainText("Licence number not found on the FSCA register");
    await expect(page.getByTestId("authorisation-short_term_insurance")).toContainText("Not recorded");
  });

  test("verifying a claim authorises the organisation; appetite stays within it", async ({ page }) => {
    await page.goto("/dashboard/authorisations");
    const row = page.getByTestId("authorisations-pending").getByTestId("authorisation-row").filter({ hasText: "Investments and retirement" });
    await row.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByTestId("authorisations-verified")).toContainText("Investments and retirement");

    await page.goto("/dashboard/brokers?workspace=individual");
    const card = page.getByTestId("broker-card").filter({ hasText: "Lerato Ndlovu Financial Planning" });
    await expect(card.getByTestId("authorised-categories")).toContainText("Life and funeral cover");
    await expect(card.getByTestId("authorised-categories")).toContainText("Investments and retirement");

    await card.getByRole("button", { name: /appetite/i }).click();
    const editor = card.getByTestId("broker-appetite-editor");
    const motor = editor.getByLabel(/Motor Insurance/);
    await expect(motor).toBeDisabled();
    await expect(editor.getByLabel(/Life Insurance/)).toBeEnabled();

    // Revoking needs a reason, and moves the authorisation out of "Verified".
    await page.goto("/dashboard/authorisations");
    const verified = page.getByTestId("authorisations-verified").getByTestId("authorisation-row").filter({ hasText: "Investments and retirement" });
    await verified.getByRole("button", { name: "Revoke…" }).click();
    await verified.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(verified.getByRole("alert")).toContainText("Give a reason the holder will see");
    await verified.getByLabel("Reason (needed to revoke)").fill("Appointment ended");
    await verified.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.getByTestId("authorisations-closed")).toContainText("Appointment ended");
    await expect(page.getByTestId("authorisations-closed")).toContainText("Lerato Ndlovu Financial Planning");
  });

  test("the admin home counts authorisations to review", async ({ page }) => {
    await page.goto("/dashboard/admin");
    await expect(page.getByTestId("admin-home-cards")).toContainText("Authorisations to review");
  });
});
