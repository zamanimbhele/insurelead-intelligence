import { expect, test } from "@playwright/test";

// Platform admin (the default demo role, no role switch needed) is also
// one of the roles canManageCampaigns() allows (see auth.ts), so since
// the visual campaign authoring form (CampaignCreateForm.tsx,
// e2e/campaign-authoring.spec.ts) landed on this same page, this test
// scopes every assertion to the two specific seeded campaign cards
// rather than the page as a whole. Two things changed once a form other
// than the seeded cards could put the same text on the page:
// - "Business Insurance" is no longer a page-wide-unique exact string -
//   it is also the create form's own product checklist label for this
//   demo tenant's approved appetite - so it is asserted only within the
//   "SME renewal readiness" card now, not via a bare page-wide
//   getByText(), which would otherwise throw a strict-mode violation on
//   two matches.
// - The total "campaign-card" count is no longer fixed at exactly 2: the
//   authoring form on this same page can create additional campaigns
//   that persist in the shared demo-store JSON for the rest of a test
//   run (the same non-resetting-between-files behaviour every other
//   e2e spec that writes demo data already relies on - e.g.
//   sending-identity.spec.ts's new identity, fye-campaign-planner.spec.ts's
//   new plans), so this test only checks that the two seeded cards are
//   present, never that they are the only ones.
test("campaign workspace separates broker-owned, product-specific drafts from delivery", async ({ page }) => {
  await page.goto("/dashboard/campaigns");

  await expect(page.getByRole("heading", { name: "Campaign Orchestration" })).toBeVisible();

  const motorCard = page.getByTestId("campaign-card").filter({ hasText: "Spring motor cover review" });
  const smeCard = page.getByTestId("campaign-card").filter({ hasText: "SME renewal readiness" });
  await expect(motorCard).toBeVisible();
  await expect(smeCard).toBeVisible();
  await expect(motorCard.getByText("Personal Lines Broker Pilot", { exact: true })).toBeVisible();
  await expect(motorCard.getByText("Motor Insurance", { exact: true })).toBeVisible();
  await expect(smeCard.getByText("National SME Insurance Pilot", { exact: true })).toBeVisible();
  await expect(smeCard.getByText("Business Insurance", { exact: true })).toBeVisible();
  await expect(page.getByText(/Generation, approval, and delivery remain separate audited actions/i)).toBeVisible();
});
