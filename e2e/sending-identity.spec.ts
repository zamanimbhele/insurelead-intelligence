import { test, expect } from "@playwright/test";

// Broker self-service "add a sending identity" form (SendingIdentityForm.tsx
// on /dashboard/broker-profile), the counterpart to the platform-admin-only
// review action already covered by tenancy.spec.ts's broker-directory test.
// Gated by canCreateSendingIdentity() (auth.ts): broker_admin/campaign_manager
// only - deliberately not the default Super Admin (platform_admin) demo
// account, since a platform admin has no broker organisation of their own
// to attach an identity to (see that function's comment).
test.describe("Broker self-service sending identity creation (synthetic demo data)", () => {
  test("a platform admin (the default demo role) does not see the add-identity form", async ({ page }) => {
    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("sending-identity-form")).toHaveCount(0);
  });

  test("a Broker Manager can add a sending identity, which appears pending", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_admin");

    await page.goto("/dashboard/broker-profile");
    const form = page.getByTestId("sending-identity-form");
    await expect(form).toBeVisible();

    const domain = `mail.e2e-${Date.now()}.co.za`;
    const fromEmail = `consultations@${domain}`;
    await form.getByLabel("Sending domain").fill(domain);
    await form.getByLabel("From name").fill("E2E Test Brokers");
    await form.getByLabel("From email").fill(fromEmail);
    await form.getByRole("button", { name: "Add sending identity" }).click();

    await expect(form.getByText("A platform administrator still needs to verify this identity")).toBeVisible();
    await expect(page.getByText(fromEmail, { exact: true })).toBeVisible();
    await expect(page.getByText(domain)).toBeVisible();
    await expect(page.getByText("pending", { exact: true }).first()).toBeVisible();
  });

  test("an ordinary Broker (broker_agent) does not see the add-identity form", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_agent");

    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("sending-identity-form")).toHaveCount(0);
  });
});
