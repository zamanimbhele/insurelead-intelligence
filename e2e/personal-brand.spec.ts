import { expect, test, type Page } from "@playwright/test";

// Personal brand and representative disclosure (phase 4). The demo solo
// advisor is seeded with a personal brand and is authorised for life and
// funeral cover.
async function viewAsSolo(page: Page) {
  await page.goto("/dashboard");
  await page.getByLabel("Viewing as (demo role)").selectOption("solo_advisor");
  await expect(page.getByText("Lerato Ndlovu").first()).toBeVisible();
}

const SOLO = "buyer_solo_advisor";
const BRAND = {
  brandMode: "personal", displayName: "Lerato Ndlovu", capacity: "representative",
  fspName: "Example Life Financial Services (demo)", fspNumber: "FSP-DEMO-104",
};

test.describe("Personal brand (synthetic demo data)", () => {
  test("the branding settings preview the disclosure, without the placeholder note", async ({ page }) => {
    await viewAsSolo(page);
    await page.goto("/dashboard/broker-profile");
    const settings = page.getByTestId("brand-settings");
    await expect(settings.getByLabel("Personal brand")).toBeChecked();
    const preview = settings.getByTestId("disclosure-preview");
    await expect(preview).toContainText("Lerato Ndlovu is a representative of Example Life Financial Services (demo), an authorised financial services provider (FSP FSP-DEMO-104).");
    await expect(preview).toContainText("Placeholder wording");
    await expect(preview).not.toContainText("confirm this wording");

    await settings.getByLabel("FSP number").fill("");
    await expect(preview).toContainText("Fill in all four details");
    await settings.getByRole("button", { name: "Save branding" }).click();
    await expect(settings.getByRole("alert")).toContainText("A personal brand needs your name, capacity, FSP name and FSP number");
  });

  test("campaign content carries the disclosure, and is flagged when the details change", async ({ page }) => {
    await viewAsSolo(page);
    const run = Date.now();
    const identity = await page.request.post("/api/sending-identities", {
      data: { domain: "mail.lerato-demo.example-synthetic.co.za", fromName: "Lerato Ndlovu", fromEmail: `lerato-${run}@mail.lerato-demo.example-synthetic.co.za` },
    });
    expect(identity.ok(), await identity.text()).toBeTruthy();
    const sendingIdentityId = (await identity.json()).sendingIdentity.id as string;

    const created = await page.request.post("/api/campaigns", {
      data: { name: `Family cover ${Date.now()}`, objective: "awareness", insuranceProducts: ["life_insurance"], sendingIdentityId },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const campaignId = (await created.json()).campaign.id as string;
    const generated = await page.request.post(`/api/campaigns/${campaignId}/content`, {
      data: { keyMessage: "Is your family protected if something happens to you?", callToActionLabel: "Book a review", callToActionUrl: "https://example-synthetic.co.za/review" },
    });
    expect(generated.ok(), await generated.text()).toBeTruthy();

    await page.goto(`/dashboard/campaigns/${campaignId}`);
    const preview = page.getByTestId("campaign-content-preview");
    await expect(preview).toContainText("Lerato Ndlovu is a representative of Example Life Financial Services (demo)");
    await expect(preview).toContainText("Sent by Lerato Ndlovu.");
    await expect(page.getByTestId("campaign-validation")).toContainText("still a placeholder");
    await expect(page.getByTestId("campaign-validation")).not.toContainText("out of date");

    // A changed FSP number makes the content's disclosure out of date.
    const changed = await page.request.post(`/api/organisations/${SOLO}/brand`, { data: { ...BRAND, fspNumber: "FSP-DEMO-999" } });
    expect(changed.ok(), await changed.text()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("campaign-validation")).toContainText("missing or out of date");

    const restored = await page.request.post(`/api/organisations/${SOLO}/brand`, { data: BRAND });
    expect(restored.ok()).toBeTruthy();
  });

  test("admins see who uses a personal brand", async ({ page }) => {
    await page.goto("/dashboard/brokers?workspace=individual");
    await expect(page.getByTestId("broker-card").first().getByTestId("personal-brand-badge")).toHaveText("Personal brand");
  });
});
