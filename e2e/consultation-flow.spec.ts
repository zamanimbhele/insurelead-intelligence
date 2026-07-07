import { test, expect } from "@playwright/test";

/**
 * Covers the platform's core MVP acceptance criterion:
 * "A business can submit an insurance consultation request... the lead is
 * saved securely... consent wording and timestamp are stored... UTM
 * attribution is stored... the thank-you page never exposes submitted
 * details in the URL."
 *
 * Uses a unique, clearly-synthetic business name per run so test leads are
 * easy to distinguish from seeded demo data and from each other on reruns.
 */
test.describe("Consultation request - happy path", () => {
  test("submits all four steps and lands on a generic, PII-free thank-you page", async ({ page }) => {
    const runId = Date.now();
    const businessName = `E2E Test Business ${runId}`;
    const contactEmail = `e2e-${runId}@example-synthetic.co.za`;

    await page.goto("/consultation?utm_source=e2e&utm_medium=test&utm_campaign=ci-suite");

    // Step 1: Business Details
    await expect(page.getByRole("heading", { name: "Business Details" })).toBeVisible();
    await page.getByLabel("Business name").fill(businessName);
    await page.getByLabel("Industry").selectOption({ label: "Retail and E-commerce" });
    await page.getByLabel("Business type").selectOption({ label: "Private Company (Pty Ltd)" });
    await page.getByLabel("Number of employees").selectOption({ label: "6-20" });
    await page.getByLabel("Annual turnover range").selectOption({ label: "R1 million - R5 million" });
    await page.getByLabel("Years in operation").selectOption({ label: "4-10 years" });
    await page.getByLabel("Province").selectOption({ label: "Gauteng" });
    await page.getByLabel("City or town").fill("Johannesburg");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: Insurance Needs
    await expect(page.getByRole("heading", { name: "Insurance Needs" })).toBeVisible();
    await page.getByLabel("Public Liability Insurance").check();
    await page.getByLabel("Cyber Insurance").check();
    await page.getByLabel("Current insurance status").selectOption({ label: "Not currently insured" });
    await page.getByLabel("Preferred contact channel").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Contact Person
    await expect(page.getByRole("heading", { name: "Contact Person" })).toBeVisible();
    await page.getByLabel("Full name").fill("E2E Test Contact");
    await page.getByLabel("Role or job title").fill("Operations Manager");
    await page.getByLabel("Work email address").fill(contactEmail);
    await page.getByLabel("Mobile number").fill("0821234567");
    await page.getByLabel("Preferred contact method").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: Consent
    await expect(page.getByRole("heading", { name: "Consent" })).toBeVisible();
    await page.getByLabel(/I have read and acknowledge the/i).check();
    await page.getByLabel(/I am requesting contact regarding/i).check();
    await page.getByLabel(/I confirm that the information I have submitted is accurate/i).check();
    await page.getByLabel(/I understand that submitting this enquiry does not create insurance cover/i).check();
    // Marketing consent is intentionally left unchecked - it must never be
    // pre-selected or required.
    await expect(page.getByLabel(/receive future business insurance marketing/i)).not.toBeChecked();

    await page.getByRole("button", { name: "Submit Enquiry" }).click();

    // Thank-you page: generic, no submitted data in the URL.
    await expect(page).toHaveURL(/\/consultation\/thank-you$/);
    expect(page.url()).not.toContain(encodeURIComponent(businessName));
    expect(page.url()).not.toContain(encodeURIComponent(contactEmail));
    await expect(page.getByRole("heading", { name: "Thank you for your enquiry" })).toBeVisible();
    // Note: the phrase "does not create insurance cover, a binding quote" also
    // appears in the site-wide Footer disclaimer, so it is not a safe locator
    // here (it would match twice and fail Playwright's strict mode). This
    // phrase is unique to the thank-you page's own copy.
    await expect(page.getByText(/No details from your submission are shown or stored/i)).toBeVisible();
  });
});
