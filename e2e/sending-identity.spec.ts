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
    // The role select auto-submits a server action on change
    // (DemoRoleSwitcher.tsx's requestSubmit()), which sets the demo_role
    // cookie and then redirects back to /dashboard (always /dashboard -
    // the form has no hidden "next" field, so setDemoRole()'s
    // safeNextPath() falls back to it). Because that redirect's target is
    // the SAME route we are already on, waiting on the URL would be
    // vacuously true before the round trip even finishes; an immediate
    // page.goto() to a different page then races ahead of (and can
    // cancel) the in-flight submission, so the cookie is never applied
    // and the next page load still shows the previous role. Waiting for
    // the sidebar's own identity line to show the new demo account's
    // name is a real, state-dependent signal instead - server-rendered
    // from the cookie-derived identity, so it cannot appear until the
    // redirect has actually landed. (This exact race broke the sibling
    // e2e/broker-team-invite.spec.ts in real CI - see BACKLOG.md.)
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_admin");
    await expect(page.getByRole("complementary").getByText("Johan van der Merwe")).toBeVisible();

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
    // Non-exact getByText(domain) also matches the from-email paragraph,
    // which contains the domain as a substring ("consultations@mail.e2e-
    // ...") - exact: true scopes this to the domain-only paragraph.
    await expect(page.getByText(domain, { exact: true })).toBeVisible();
    await expect(page.getByText("pending", { exact: true }).first()).toBeVisible();
  });

  test("an ordinary Broker (broker_agent) does not see the add-identity form", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_agent");
    await expect(page.getByRole("complementary").getByText("Sipho Khumalo")).toBeVisible();

    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("sending-identity-form")).toHaveCount(0);
  });
});
