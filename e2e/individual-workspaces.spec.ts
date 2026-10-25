import { expect, test, type Page } from "@playwright/test";

// Individual workspaces (phase 2). The "Solo Advisor" demo account is a
// broker admin whose organisation is an individual workspace.
async function viewAs(page: Page, account: string, displayName: string) {
  await page.goto("/dashboard");
  await page.getByLabel("Viewing as (demo role)").selectOption(account);
  await expect(page.getByText(displayName).first()).toBeVisible();
}

test.describe("Individual workspaces (synthetic demo data)", () => {
  test("a solo advisor sees their own practice without team pages", async ({ page }) => {
    await viewAs(page, "solo_advisor", "Lerato Ndlovu");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "My practice" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Broker Profile" })).toHaveCount(0);

    await nav.getByRole("link", { name: "My practice" }).click();
    await expect(page.getByRole("heading", { name: "My practice", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lerato Ndlovu Financial Planning" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organisation members" })).toHaveCount(0);
    await expect(page.getByTestId("solo-team-invite")).toContainText("Working with someone? Invite a colleague");
  });

  test("a brokerage keeps the broker profile and team section", async ({ page }) => {
    await viewAs(page, "broker_admin", "Johan van der Merwe");
    await page.getByRole("navigation").getByRole("link", { name: "Broker Profile" }).click();
    await expect(page.getByRole("heading", { name: "Organisation members" })).toBeVisible();
    await expect(page.getByTestId("solo-team-invite")).toHaveCount(0);
  });

  test("admins filter the directory by workspace type and can change it", async ({ page }) => {
    await page.goto("/dashboard/brokers");
    await page.getByRole("navigation", { name: "Filter by workspace type" }).getByRole("link", { name: /^Individual/ }).click();
    await expect(page).toHaveURL(/workspace=individual/);
    const cards = page.getByTestId("broker-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Lerato Ndlovu Financial Planning");
    await expect(cards.first().getByTestId("workspace-type-badge")).toHaveText("Individual");

    // Change it and back again (the directory data is shared by the suite).
    // Each change saves in the background, so wait for the save to finish
    // before moving on; otherwise a slow runner navigates away first.
    const changeTo = async (type: string) => {
      const saved = page.waitForResponse((response) =>
        response.url().includes("/workspace-type") && response.request().method() === "POST");
      await page.getByTestId("broker-card").first().getByLabel("Workspace").selectOption(type);
      expect((await saved).ok()).toBeTruthy();
    };
    await changeTo("practice");
    await page.goto("/dashboard/brokers?workspace=practice");
    await expect(page.getByTestId("broker-card").first()).toContainText("Lerato Ndlovu Financial Planning");
    await changeTo("individual");
    await page.goto("/dashboard/brokers?workspace=individual");
    await expect(page.getByTestId("broker-card")).toHaveCount(1);
  });

  test("the admin home breaks active organisations down by type", async ({ page }) => {
    await page.goto("/dashboard/admin");
    await expect(page.getByTestId("admin-home-cards")).toContainText("1 individual · 0 practice · 3 brokerage");
  });
});
