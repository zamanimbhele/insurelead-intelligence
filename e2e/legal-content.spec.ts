import { test, expect } from "@playwright/test";

// Demo mode's identity is always "demo_platform_admin" (see getDashboardIdentity()
// in src/lib/auth.ts), which canManageCompliance() always allows, so the edit
// controls are visible without a separate sign-in step - same assumption
// data-source-registry.spec.ts makes.

test.describe("Legal Content manager (synthetic demo data)", () => {
  test("editing a document bumps its version, keeps history, and the public page reflects it immediately", async ({ page }) => {
    await page.goto("/dashboard/legal-content");
    await expect(page.getByRole("heading", { name: "Legal Content", exact: true })).toBeVisible();

    const card = page.getByTestId("legal-text-card").filter({ hasText: "Privacy Notice" }).first();
    await expect(card).toBeVisible();

    // Read the current version rather than assuming "v1": this is a fixed
    // singleton document, not a freshly-created record with a unique id,
    // so a prior run in the same demo-store.json (a local rerun, or a
    // Playwright retry of this very test after a failure) can easily have
    // already bumped it. Every other e2e test in this suite sidesteps the
    // same problem by giving freshly-created records a Date.now()-unique
    // name; a singleton document has no such option, so this reads its
    // actual starting point instead of hardcoding one.
    //
    // textContent(), not innerText(): the badge has an "uppercase" CSS
    // class, and innerText() returns text as rendered (CSS text-transform
    // included), so it reads back "V1" - the capital V then fails a
    // case-sensitive /^v/ strip and silently produces NaN. textContent()
    // returns the raw DOM text ("v1"), unaffected by CSS, which is also
    // what toHaveText() below actually compares against.
    const startVersionText = ((await card.getByTestId("legal-text-version").textContent()) ?? "").trim();
    const startVersion = Number(startVersionText.replace(/^v/, ""));
    const nextVersion = startVersion + 1;

    const uniqueSentence = `This privacy notice was reviewed by E2E on ${Date.now()}.`;
    await card.getByRole("button", { name: "Edit" }).click();
    const textarea = card.getByRole("textbox");
    const originalContent = await textarea.inputValue();
    await textarea.fill(uniqueSentence);
    await card.getByRole("button", { name: "Save and publish" }).click();

    await expect(card.getByTestId("legal-text-version")).toHaveText(`v${nextVersion}`);
    await expect(card.getByText(uniqueSentence)).toBeVisible();

    // The prior version must still be readable in its history, not lost -
    // this is the regression check for a real bug: a document's starting
    // version was previously only ever synthesized on the fly for display
    // and never actually written to legal_text_document_versions, so its
    // very first edit silently dropped it from history for good.
    await card.getByRole("button", { name: "Version history" }).click();
    await expect(card.getByText(new RegExp(`^v${startVersion} by`))).toBeVisible();
    await expect(card.getByText(originalContent.split("\n")[0])).toBeVisible();

    // The public Privacy Notice page reads the same live document - no
    // redeploy needed for a compliance admin's edit to take effect.
    await page.goto("/privacy");
    await expect(page.getByText(uniqueSentence)).toBeVisible();
    await expect(page.getByText(new RegExp(`Version v${nextVersion}\\b`))).toBeVisible();
  });

  test("a non-managing viewer cannot edit, but a manager sees Edit controls on every document", async ({ page }) => {
    await page.goto("/dashboard/legal-content");

    const cards = page.getByTestId("legal-text-card");
    await expect(cards).toHaveCount(7);
    for (const key of [
      "Privacy Notice",
      "Consent Wording",
      "Contact Permission Wording",
      "Marketing Communication Wording",
      "Financial Services Provider Disclosures",
      "Terms of Use",
      "Data Retention Policy",
    ]) {
      await expect(cards.filter({ hasText: key }).first().getByRole("button", { name: "Edit" })).toBeVisible();
    }
  });
});

test.describe("Public site reflects configurable legal text", () => {
  test("Terms of Use page renders the terms_of_use and fsp_disclosures documents", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
    await expect(page.getByText(/does not create insurance cover, a binding quote/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Financial Services Provider Disclosures" })).toBeVisible();
  });

  test("consultation form's consent step shows the live consent and contact wording", async ({ page }) => {
    await page.goto("/consultation?product=motor_insurance");
    await page.getByLabel("Province").selectOption({ label: "Gauteng" });
    await page.getByLabel("City or town").fill("Johannesburg");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Current insurance status").selectOption({ label: "Not currently insured" });
    await page.getByLabel("Preferred contact channel").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Full name").fill("E2E Legal Content Contact");
    await page.getByLabel("Email address").fill(`e2e-legal-content-${Date.now()}@example-synthetic.co.za`);
    await page.getByLabel("Mobile number").fill("0821234567");
    await page.getByLabel("Preferred contact method").selectOption({ label: "Email" });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Consent" })).toBeVisible();
    // These checkboxes are rendered entirely from the live legal_text_documents
    // content now - no longer hardcoded JSX - so this also doubles as a check
    // that the public runtime read path (getRuntimeLegalTextDocuments) works.
    await expect(page.getByLabel(/I am requesting contact about the insurance products/i)).toBeVisible();
    await expect(page.getByLabel(/I consent to InsureLead sharing this enquiry/i)).toBeVisible();
    await expect(page.getByLabel(/receive future insurance marketing communications/i)).toBeVisible();
  });
});
