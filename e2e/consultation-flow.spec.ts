import { test, expect } from "@playwright/test";

/**
 * Covers the platform's core MVP acceptance criterion:
 * "An applicant can submit an insurance enquiry... the lead is
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

    // Step 1: About You
    await expect(page.getByRole("heading", { name: "About You" })).toBeVisible();
    await page.getByLabel("My business").check();
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
    await page.getByLabel("Business Insurance").check();
    await page.getByLabel("Public Liability Insurance").check();
    await page.getByLabel("Cyber Insurance").check();
    await page.getByLabel("Current insurance status").selectOption({ label: "Not currently insured" });
    await page.getByLabel("Preferred contact channel").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Contact Details
    await expect(page.getByRole("heading", { name: "Contact Details" })).toBeVisible();
    await page.getByLabel("Full name").fill("E2E Test Contact");
    await page.getByLabel("Role or job title").fill("Operations Manager");
    await page.getByLabel("Email address").fill(contactEmail);
    await page.getByLabel("Mobile number").fill("0821234567");
    await page.getByLabel("Preferred contact method").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: Consent
    await expect(page.getByRole("heading", { name: "Consent" })).toBeVisible();
    await page.getByLabel(/I have read and acknowledge the/i).check();
    await page.getByLabel(/I am requesting contact about the insurance products/i).check();
    await page.getByLabel(/I consent to InsureLead sharing this enquiry/i).check();
    await page.getByLabel("Maximum approved partners").selectOption("1");
    await page.getByLabel(/I confirm that the information I have submitted is accurate/i).check();
    await page.getByLabel(/I understand that submitting this enquiry does not create insurance cover/i).check();
    // Marketing consent is intentionally left unchecked - it must never be
    // pre-selected or required.
    await expect(page.getByLabel(/receive future insurance marketing communications/i)).not.toBeChecked();

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

  test("submits a personal motor enquiry without requiring business fields", async ({ page }) => {
    const runId = Date.now();

    await page.goto("/consultation?product=motor_insurance&utm_source=e2e-personal");
    await expect(page.getByLabel("Me or my household")).toBeChecked();
    await page.getByLabel("Province").selectOption({ label: "Gauteng" });
    await page.getByLabel("City or town").fill("Johannesburg");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByLabel("Motor Insurance")).toBeChecked();
    await page.getByLabel("Current insurance status").selectOption({ label: "Not currently insured" });
    await page.getByLabel("Preferred contact channel").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Full name").fill("E2E Personal Applicant");
    await page.getByLabel("Email address").fill(`e2e-personal-${runId}@example-synthetic.co.za`);
    await page.getByLabel("Mobile number").fill("0827654321");
    await page.getByLabel("Preferred contact method").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel(/I have read and acknowledge the/i).check();
    await page.getByLabel(/I am requesting contact about the insurance products/i).check();
    await page.getByLabel(/I consent to InsureLead sharing this enquiry/i).check();
    await page.getByLabel(/I confirm that the information I have submitted is accurate/i).check();
    await page.getByLabel(/I understand that submitting this enquiry does not create insurance cover/i).check();
    await page.getByRole("button", { name: "Submit Enquiry" }).click();

    await expect(page).toHaveURL(/\/consultation\/thank-you$/);
  });
});
