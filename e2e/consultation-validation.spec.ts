import { test, expect } from "@playwright/test";

test.describe("Consultation request - validation and consent gating", () => {
  test("blocks progression past step 1 when required fields are missing", async ({ page }) => {
    await page.goto("/consultation");

    await page.getByRole("button", { name: "Continue" }).click();

    // Still on step 1 - the heading has not advanced to "Insurance Needs".
    await expect(page.getByRole("heading", { name: "Business Details" })).toBeVisible();
    await expect(page.getByText("Business name is required")).toBeVisible();
    await expect(page.getByText("Please select an industry")).toBeVisible();
  });

  test("cannot submit without required consent, even with everything else valid", async ({ page }) => {
    await page.goto("/consultation");

    await page.getByLabel("Business name").fill("Consent Gate Test Co");
    await page.getByLabel("Industry").selectOption({ label: "Professional Services" });
    await page.getByLabel("Business type").selectOption({ label: "Private Company (Pty Ltd)" });
    await page.getByLabel("Number of employees").selectOption({ label: "1-5" });
    await page.getByLabel("Annual turnover range").selectOption({ label: "Under R1 million" });
    await page.getByLabel("Years in operation").selectOption({ label: "1-3 years" });
    await page.getByLabel("Province").selectOption({ label: "Western Cape" });
    await page.getByLabel("City or town").fill("Cape Town");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Business Interruption Cover").check();
    await page.getByLabel("Current insurance status").selectOption({ label: "Unsure" });
    await page.getByLabel("Preferred contact channel").selectOption({ label: "Phone" });
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Full name").fill("Consent Gate Contact");
    await page.getByLabel("Role or job title").fill("Owner");
    await page.getByLabel("Work email address").fill("consent-gate@example-synthetic.co.za");
    await page.getByLabel("Mobile number").fill("0731234567");
    await page.getByLabel("Preferred contact method").selectOption({ label: "Phone" });
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: submit without checking any consent boxes.
    await expect(page.getByRole("heading", { name: "Consent" })).toBeVisible();
    await page.getByRole("button", { name: "Submit Enquiry" }).click();

    // Must remain on the consultation page - never reaches the thank-you page.
    await expect(page).toHaveURL(/\/consultation/);
    await expect(page).not.toHaveURL(/thank-you/);
    await expect(page.getByText("You must acknowledge the privacy notice")).toBeVisible();
    await expect(page.getByText("Consent to be contacted is required to submit this enquiry")).toBeVisible();
  });
});
