import { expect, test, type Page } from "@playwright/test";

// Broker appetite & permissions editor (Broker Directory) and the campaign
// form's empty-appetite state. Production incident 2026-10-18: an approved
// broker with no buyer_preferences row rendered an empty product checklist
// that could never pass "Select at least one insurance product". Every
// test restores the seeded buyers.json values through the same admin API
// so later specs (campaign-authoring, campaigns) see the original seed.
const GAUTENG = "Gauteng Commercial Broker Pilot";
const PERSONAL = "Personal Lines Broker Pilot";

async function openBrokerCard(page: Page, name: string) {
  await page.goto("/dashboard/brokers");
  const card = page.getByTestId("broker-card").filter({ hasText: name });
  await expect(card).toBeVisible();
  return card;
}

async function restore(page: Page, organisationId: string, preferences: Record<string, unknown>) {
  const response = await page.request.post(`/api/admin/organisations/${organisationId}/preferences`, { data: preferences });
  expect(response.ok()).toBeTruthy();
}

test.describe("Broker appetite editor (synthetic demo data)", () => {
  test("a platform admin can add an approved product and it shows on the broker card", async ({ page }) => {
    const card = await openBrokerCard(page, PERSONAL);
    await card.getByRole("button", { name: "Edit appetite & permissions" }).click();
    const editor = card.getByTestId("broker-appetite-editor");
    // Personal Lines is authorised for short-term insurance only, so a
    // long-term product such as Funeral Cover cannot be chosen.
    await expect(editor.getByLabel(/Funeral Cover/)).toBeDisabled();
    await editor.getByLabel(/^Insurance Review/).check();
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByText("Appetite and permissions saved.")).toBeVisible();
    await expect(card.getByText("Insurance Review", { exact: true }).first()).toBeVisible();

    await editor.getByLabel(/^Insurance Review/).uncheck();
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByText("Appetite and permissions saved.")).toBeVisible();
  });

  test("campaigns cannot be enabled without an approved product", async ({ page }) => {
    const card = await openBrokerCard(page, PERSONAL);
    await card.getByRole("button", { name: "Edit appetite & permissions" }).click();
    const editor = card.getByTestId("broker-appetite-editor");
    for (const product of ["Motor Insurance", "Home & Contents", "Travel Insurance", "Personal Accident"]) {
      await editor.getByLabel(product).uncheck();
    }
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByRole("alert")).toHaveText("Campaigns require at least one approved insurance product");
  });

  test("a fractional minimum score is rejected by the API", async ({ page }) => {
    await page.goto("/dashboard/brokers");
    const response = await page.request.post("/api/admin/organisations/does-not-matter/preferences", {
      data: { insuranceProducts: [], provinces: [], minimumScore: 72.5, dailyLeadCapacity: 25, acceptsCampaigns: false, acceptsSharedLeads: false },
    });
    expect(response.status()).toBe(400);
  });

  test("a broker with no approved products sees an explanation instead of an unusable campaign form", async ({ page }) => {
    await page.goto("/dashboard/brokers");
    const card = page.getByTestId("broker-card").filter({ hasText: GAUTENG });
    await card.getByRole("button", { name: "Edit appetite & permissions" }).click();
    const editor = card.getByTestId("broker-appetite-editor");

    // Capture the seeded values so the finally block can put them back.
    const seeded = {
      insuranceProducts: ["business_insurance"],
      provinces: ["Gauteng"],
      minimumScore: await editor.getByLabel("Minimum lead score (0-100)").inputValue().then(Number),
      dailyLeadCapacity: await editor.getByLabel("Daily lead capacity (1-1000)").inputValue().then(Number),
      acceptsCampaigns: true,
      acceptsSharedLeads: await editor.getByLabel("Accepts shared leads").isChecked(),
    };

    const saveRequest = page.waitForRequest((request) => request.url().includes("/preferences") && request.method() === "POST");
    await editor.getByLabel("Business Insurance").uncheck();
    await editor.getByLabel("Campaigns enabled").uncheck();
    await editor.getByRole("button", { name: "Save" }).click();
    const gautengId = (await saveRequest).url().split("/organisations/")[1].split("/")[0];
    await expect(editor.getByText("Appetite and permissions saved.")).toBeVisible();

    try {
      await page.getByLabel("Viewing as (demo role)").selectOption("broker_admin");
      await page.goto("/dashboard/campaigns");
      const form = page.getByTestId("campaign-create-form");
      await expect(form).toContainText("Campaign drafting is not available yet");
      await expect(form).toContainText("no approved insurance products");
      await expect(form.getByRole("button", { name: "Create draft" })).toHaveCount(0);
    } finally {
      // No demo_role cookie = the default platform_admin account again.
      await page.context().clearCookies();
      await restore(page, gautengId, seeded);
    }
  });
});
