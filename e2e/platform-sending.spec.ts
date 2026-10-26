import { expect, test, type Page } from "@playwright/test";

// Platform-managed sending (phase 5): "<Name> via InsureLead" for advisors
// without their own email domain.
async function viewAsSolo(page: Page) {
  await page.goto("/dashboard");
  await page.getByLabel("Viewing as (demo role)").selectOption("solo_advisor");
  await expect(page.getByText("Lerato Ndlovu").first()).toBeVisible();
}

test.describe("InsureLead sending (synthetic demo data)", () => {
  test("an advisor without a domain sends as 'Name via InsureLead', replying to their own email", async ({ page }) => {
    await viewAsSolo(page);
    await page.goto("/dashboard/broker-profile");
    const offer = page.getByTestId("platform-sending-offer");
    await expect(offer).toContainText("Lerato Ndlovu via InsureLead");
    await expect(offer).toContainText("demo.soloadvisor@example-synthetic.co.za");
    await offer.getByRole("button", { name: "Use InsureLead sending" }).click();

    const identity = page.getByTestId("sending-identity").filter({ hasText: "via InsureLead" });
    await expect(identity).toContainText("InsureLead sending");
    await expect(identity).toContainText("verified");
    await expect(identity).toContainText("replies to demo.soloadvisor@example-synthetic.co.za");
    await expect(identity).toContainText("up to 50 emails a day");
    await expect(page.getByTestId("platform-sending-offer")).toHaveCount(0);
  });

  test("admins see the sender's reputation and can disable and re-enable it", async ({ page }) => {
    await page.goto("/dashboard/brokers?workspace=individual");
    const row = page.getByTestId("directory-sending-identity").filter({ hasText: "InsureLead sending" });
    await expect(row).toContainText("Last 30 days: 0 sent");

    await row.getByRole("button", { name: "Disable" }).click();
    await expect(row).toContainText("Disabled by a platform administrator");
    await row.getByRole("button", { name: "Mark verified" }).click();
    await expect(row).not.toContainText("Disabled by a platform administrator");
    await expect(row).toContainText("verified");
  });

  test("the health check reports whether InsureLead sending is set up", async ({ request }) => {
    const health = await (await request.get("/api/health")).json();
    expect(health.checks.platformSending).toBe("configured");
  });
});
