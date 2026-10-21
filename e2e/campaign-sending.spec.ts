import { expect, test } from "@playwright/test";

// Campaign sending limits and scheduling (campaign-sender.ts,
// /api/campaigns/[id]/schedule, /api/cron/campaign-sends). Demo mode's
// seeded campaigns can never pass validation (their sending identities
// stay pending - verification is Supabase-only), so the happy path of a
// batch actually being sent is covered by the unit tests in
// src/lib/campaign-sender.test.ts. These tests cover what a person sees
// and every access/validation gate in front of the scheduler.
const CONFIRMATION = "I confirm this campaign may be emailed to its eligible audience";

test.describe("Campaign sending limits and scheduling (synthetic demo data)", () => {
  test("the campaign page shows the broker's send usage against its limits", async ({ page }) => {
    await page.goto("/dashboard/campaigns/campaign_demo_motor");
    const panel = page.getByTestId("campaign-sending-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("progressbar", { name: /Broker emails today: \d+ of 200 sent/ })).toBeVisible();
    await expect(panel.getByRole("progressbar", { name: /Broker emails this month: \d+ of 3000 sent/ })).toBeVisible();
    await expect(page.getByTestId("campaign-sending-state")).toContainText("Approve the campaign before it can be scheduled.");
    await expect(page.getByTestId("campaign-schedule-form")).toHaveCount(0);
  });

  test("scheduling is refused for a campaign that is not approved", async ({ page }) => {
    await page.goto("/dashboard");
    const response = await page.request.post("/api/campaigns/campaign_demo_motor/schedule", {
      data: { sendAt: "now", confirmation: CONFIRMATION },
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).error).toBe("Only an approved or paused campaign can be scheduled");
  });

  test("scheduling requires the exact confirmation and a well-formed time", async ({ page }) => {
    await page.goto("/dashboard");
    const missing = await page.request.post("/api/campaigns/campaign_demo_motor/schedule", {
      data: { sendAt: "now", confirmation: "yes" },
    });
    expect(missing.status()).toBe(400);
    const badTime = await page.request.post("/api/campaigns/campaign_demo_motor/schedule", {
      data: { sendAt: "next tuesday", confirmation: CONFIRMATION },
    });
    expect(badTime.status()).toBe(400);
  });

  test("a campaign manager may draft but not schedule or stop sending", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("campaign_manager");
    await expect(page.getByRole("complementary").getByText("Aisha Patel")).toBeVisible();
    const schedule = await page.request.post("/api/campaigns/campaign_demo_motor/schedule", {
      data: { sendAt: "now", confirmation: CONFIRMATION },
    });
    expect(schedule.status()).toBe(403);
    const stop = await page.request.delete("/api/campaigns/campaign_demo_motor/schedule");
    expect(stop.status()).toBe(403);
    await page.context().clearCookies();
  });

  test("the scheduler endpoint refuses to run without a configured secret", async ({ request }) => {
    const response = await request.get("/api/cron/campaign-sends", {
      headers: { Authorization: "Bearer not-the-secret-not-the-secret" },
    });
    expect(response.status()).toBe(503);
  });

  test("a platform admin can set a broker's campaign send limits", async ({ page }) => {
    await page.goto("/dashboard/brokers");
    const card = page.getByTestId("broker-card").filter({ hasText: "Personal Lines Broker Pilot" });
    await card.getByRole("button", { name: "Edit appetite & permissions" }).click();
    const editor = card.getByTestId("broker-appetite-editor");

    await editor.getByLabel("Campaign emails per day").fill("5000");
    await editor.getByLabel("Campaign emails per month").fill("4000");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByRole("alert")).toHaveText("Daily campaign send limit cannot exceed the monthly limit");

    await editor.getByLabel("Campaign emails per day").fill("150");
    await editor.getByLabel("Campaign emails per month").fill("2500");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByText("Appetite and permissions saved.")).toBeVisible();
    await expect(card.getByText("150/day · 2500/mo")).toBeVisible();

    // Restore the defaults for later specs.
    await editor.getByLabel("Campaign emails per day").fill("200");
    await editor.getByLabel("Campaign emails per month").fill("3000");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("200/day · 3000/mo")).toBeVisible();
  });
});
