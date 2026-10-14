import { expect, test } from "@playwright/test";

// Visual campaign authoring and approval forms (BACKLOG.md, Broker
// Workflow: "Add visual campaign authoring and approval forms on top of
// the completed MCP campaign workflow") - CampaignCreateForm.tsx,
// CampaignContentForm.tsx, and CampaignApprovalForm.tsx on
// /dashboard/campaigns and /dashboard/campaigns/[id]. Gated by
// canManageCampaigns()/canApproveCampaigns() (auth.ts), which mirror the
// database's can_manage_campaigns()/can_approve_campaigns() SQL
// functions and the Campaign Orchestration MCP server's own
// assertCanCreate()/assertCanApprove() exactly.
//
// Demo mode's single seeded tenancy (getBuyers()[0], "Gauteng Commercial
// Broker Pilot") starts with a *pending* (not verified) sending identity
// and zero accepted lead allocations anywhere in the committed seed data
// (data/allocations.json is empty), so a freshly drafted demo campaign
// can never actually clear validation to a real "approved" state - the
// sending-identity review action also explicitly refuses to run in demo
// mode ("Sending-domain verification requires Supabase mode"). The first
// test below is written against that real, reachable state rather than
// manufacturing a success path the demo environment cannot actually
// reach: it proves the same validateCampaign() compliance gate the MCP
// tools and the database enforce also blocks the dashboard's own
// approve button.
test.describe("Visual campaign authoring and approval (synthetic demo data)", () => {
  test("a Broker Manager can draft a campaign and generate content, and sees approval blocked by validation", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_admin");
    await expect(page.getByRole("complementary").getByText("Johan van der Merwe")).toBeVisible();

    await page.goto("/dashboard/campaigns");
    const createForm = page.getByTestId("campaign-create-form");
    await expect(createForm).toBeVisible();

    const name = `E2E draft campaign ${Date.now()}`;
    await createForm.getByLabel("Campaign name").fill(name);
    await createForm.getByLabel("Business Insurance").check();
    await createForm.getByRole("button", { name: "Create draft" }).click();

    await expect(createForm.getByText(/Draft .* created below/)).toBeVisible();
    const card = page.getByTestId("campaign-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card.getByText("draft", { exact: true })).toBeVisible();

    await card.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    const validation = page.getByTestId("campaign-validation");
    await expect(validation.getByText("The selected sending identity is not verified.")).toBeVisible();
    await expect(validation.getByText("Generate a current campaign content version.")).toBeVisible();
    await expect(validation.getByText("No consented, allocated recipients match this campaign.")).toBeVisible();

    const approvalBlocked = page.getByTestId("campaign-approval-blocked");
    await expect(approvalBlocked).toBeVisible();
    await expect(approvalBlocked).toContainText("The selected sending identity is not verified.");
    await expect(page.getByTestId("campaign-approval-form").locator("input[type=checkbox]")).toHaveCount(0);

    const contentForm = page.getByTestId("campaign-content-form");
    await contentForm.getByLabel("Key message").fill("Your motor cover is due for review ahead of the new financial year.");
    await contentForm.getByLabel("Call-to-action label").fill("Request a review");
    await contentForm.getByLabel("Call-to-action link (https only)").fill("https://example-synthetic.co.za/review");
    await contentForm.getByRole("button", { name: "Generate content" }).click();

    await expect(contentForm.getByText(/Content version 1 generated/)).toBeVisible();
    // The CTA label is also visible, as plain text, inside the closed
    // HTML-source <details> below (as anchor text) - so this targets the
    // plain-text preview pre specifically rather than an exact page-wide
    // text match, which would otherwise try to match a tiny fragment
    // against that pre's single giant multi-line text node and fail.
    await expect(page.getByTestId("campaign-content-preview")).toContainText("Request a review");

    // Content now exists, so the content_missing issue clears, but the
    // unverified sending identity and empty audience still block
    // approval - the same two checks the MCP's approve_campaign tool and
    // the database's own policies would also stop on.
    await expect(validation.getByText("Generate a current campaign content version.")).toHaveCount(0);
    await expect(validation.getByText("The selected sending identity is not verified.")).toBeVisible();
    await expect(validation.getByText("No consented, allocated recipients match this campaign.")).toBeVisible();
    await expect(page.getByTestId("campaign-approval-blocked")).toBeVisible();
  });

  test("a Marketing Analyst can draft and author content but does not see the approval action", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("campaign_manager");
    await expect(page.getByRole("complementary").getByText("Aisha Patel")).toBeVisible();

    await page.goto("/dashboard/campaigns");
    await expect(page.getByTestId("campaign-create-form")).toBeVisible();

    await page.getByTestId("campaign-card").first().getByRole("link").click();
    await expect(page.getByTestId("campaign-content-form")).toBeVisible();
    await expect(page.getByTestId("campaign-approval-form")).toHaveCount(0);
  });

  test("an ordinary Broker does not see any campaign authoring or approval controls", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_agent");
    await expect(page.getByRole("complementary").getByText("Sipho Khumalo")).toBeVisible();

    await page.goto("/dashboard/campaigns");
    await expect(page.getByTestId("campaign-create-form")).toHaveCount(0);

    await page.getByTestId("campaign-card").first().getByRole("link").click();
    await expect(page.getByTestId("campaign-content-form")).toHaveCount(0);
    await expect(page.getByTestId("campaign-approval-form")).toHaveCount(0);
  });
});
