import { expect, test, type Page } from "@playwright/test";

// Campaign transparency: content version comparison and the audience
// breakdown (campaign-transparency.ts). Uses a fresh draft per test so the
// seeded campaigns stay untouched for other specs.
async function createDraftWithContent(page: Page, messages: string[]) {
  await page.goto("/dashboard");
  const created = await page.request.post("/api/campaigns", {
    data: {
      name: `Transparency check ${Date.now()}`,
      objective: "renewal_reminder",
      insuranceProducts: ["business_insurance"],
      sendingIdentityId: await firstSendingIdentityId(page),
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const campaignId = (await created.json()).campaign.id as string;
  for (const keyMessage of messages) {
    const generated = await page.request.post(`/api/campaigns/${campaignId}/content`, {
      data: { keyMessage, callToActionLabel: "Request a review", callToActionUrl: "https://example-synthetic.co.za/review" },
    });
    expect(generated.ok(), await generated.text()).toBeTruthy();
  }
  return campaignId;
}

async function firstSendingIdentityId(page: Page) {
  await page.goto("/dashboard/campaigns");
  return page.getByTestId("campaign-create-form").getByLabel("Sending identity").inputValue();
}

test.describe("Campaign transparency (synthetic demo data)", () => {
  test("compares two content versions line by line", async ({ page }) => {
    const campaignId = await createDraftWithContent(page, [
      "Your business cover is due for review ahead of the new financial year.",
      "Your business cover renews next month, so now is a good time to review it.",
    ]);
    await page.goto(`/dashboard/campaigns/${campaignId}`);
    await page.getByRole("link", { name: "Compare versions" }).click();

    await expect(page.getByRole("heading", { name: "Content versions" })).toBeVisible();
    await expect(page.getByTestId("campaign-version-list").getByText("Version 2")).toBeVisible();
    await expect(page.getByTestId("campaign-version-summary")).toContainText("Version 1 → version 2");
    const diff = page.getByTestId("campaign-version-diff");
    await expect(diff).toContainText("Removed: Your business cover is due for review ahead of the new financial year.");
    await expect(diff).toContainText("Added: Your business cover renews next month, so now is a good time to review it.");
  });

  test("a single-version campaign offers no comparison", async ({ page }) => {
    const campaignId = await createDraftWithContent(page, ["Your business cover is due for review this season."]);
    await page.goto(`/dashboard/campaigns/${campaignId}`);
    await expect(page.getByRole("link", { name: "Compare versions" })).toHaveCount(0);
    await page.goto(`/dashboard/campaigns/${campaignId}/versions`);
    await expect(page.getByTestId("campaign-version-compare")).toHaveCount(0);
  });

  test("the audience breakdown explains exclusions and filters by reason", async ({ page }) => {
    await page.goto("/dashboard/campaigns/campaign_demo_business");
    await page.getByTestId("campaign-audience-link").click();
    await expect(page.getByRole("heading", { name: "Audience breakdown" })).toBeVisible();
    // Demo mode has no accepted allocations, so every lead belongs to no
    // broker's book: they are counted, never listed.
    await expect(page.getByTestId("campaign-audience-not-allocated")).toContainText("not accepted by this broker");
    await expect(page.getByTestId("campaign-audience-table")).toContainText("No leads match this filter.");
    await page.getByRole("navigation", { name: "Filter by reason" }).getByRole("link", { name: /^Eligible/ }).click();
    await expect(page).toHaveURL(/reason=eligible/);
  });

  test("an unknown campaign returns not found", async ({ page }) => {
    const versions = await page.goto("/dashboard/campaigns/does-not-exist/versions");
    expect(versions?.status()).toBe(404);
    const audience = await page.goto("/dashboard/campaigns/does-not-exist/audience");
    expect(audience?.status()).toBe(404);
  });
});
