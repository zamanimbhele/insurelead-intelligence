import { expect, test } from "@playwright/test";

// Admin portal: separate sign-in page, admin home, and the admin look that
// tells platform staff they are working across every broker. Demo mode
// defaults to the platform_admin account (src/lib/auth.ts).
test.describe("Admin portal (synthetic demo data)", () => {
  test("the broker and admin sign-in pages are distinct", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Broker sign in" })).toBeVisible();

    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
    await expect(page.getByText("InsureLead platform staff only")).toBeVisible();
    await expect(page.getByRole("link", { name: /Create a broker account/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Open the synthetic admin portal" }).click();
    await expect(page).toHaveURL(/\/dashboard\/admin$/);
  });

  test("platform staff see the admin home and the admin band on every page", async ({ page }) => {
    await page.goto("/dashboard/admin");
    await expect(page.getByRole("heading", { name: "Admin home" })).toBeVisible();
    await expect(page.getByTestId("admin-home-cards")).toContainText("Brokers awaiting review");
    await expect(page.getByTestId("admin-home-integrations")).toContainText("Campaign delivery");

    const band = page.getByTestId("admin-portal-band");
    await expect(band).toContainText("Platform admin");
    await expect(band).toContainText("Changes here affect every broker");

    await page.getByRole("navigation").getByRole("link", { name: "Leads", exact: true }).click();
    await expect(page.getByTestId("admin-portal-band")).toBeVisible();
    await expect(page.locator("[data-portal]")).toHaveAttribute("data-portal", "admin");
  });

  test("a compliance auditor is labelled read-only", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("compliance_auditor");
    await expect(page.getByText("Zinhle Mahlangu")).toBeVisible();
    await page.goto("/dashboard/admin");
    await expect(page.getByTestId("admin-portal-band")).toContainText("Read-only access across every broker");
  });

  test("brokers keep the broker look and cannot open the admin home", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_agent");
    await expect(page.getByText("Sipho Khumalo")).toBeVisible();

    await expect(page.getByTestId("admin-portal-band")).toHaveCount(0);
    await expect(page.locator("[data-portal]")).toHaveAttribute("data-portal", "broker");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Admin home" })).toHaveCount(0);

    await page.goto("/dashboard/admin");
    await expect(page.getByTestId("admin-home-denied")).toBeVisible();
    await expect(page.getByTestId("admin-home-cards")).toHaveCount(0);
  });
});
