import { test, expect } from "@playwright/test";

// Broker self-service team invitations (InviteTeamMemberForm.tsx on
// /dashboard/broker-profile). The RPC/Admin-API flow itself only works
// in Supabase mode (it creates a real Supabase auth user), so this suite
// - run against demo mode, like the rest of this project's Playwright
// config - covers what demo mode CAN verify: the role gate
// (canInviteTeamMember(): broker_admin only) and that the API route
// itself correctly refuses to run in demo mode rather than silently
// doing nothing. The actual invite-then-see-invited-member flow is
// covered by the manual read-through plus balanced-syntax check
// documented in BACKLOG.md, consistent with every other RPC added in
// this series that could not be exercised against a real Postgres
// instance from this session.
test.describe("Broker self-service team invitations (synthetic demo data)", () => {
  test("a platform admin (the default demo role) does not see the invite form", async ({ page }) => {
    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("invite-team-member-form")).toHaveCount(0);
  });

  test("a Broker Manager sees the invite form; an ordinary Broker does not", async ({ page }) => {
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
    // redirect has actually landed. (Found and fixed via a local
    // Playwright run reproducing this suite's actual CI failure - see
    // BACKLOG.md.)
    const sidebar = page.getByRole("complementary");
    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_admin");
    await expect(sidebar.getByText("Johan van der Merwe")).toBeVisible();

    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("invite-team-member-form")).toBeVisible();

    await page.goto("/dashboard");
    await page.getByLabel("Viewing as (demo role)").selectOption("broker_agent");
    await expect(sidebar.getByText("Sipho Khumalo")).toBeVisible();
    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("invite-team-member-form")).toHaveCount(0);
  });

  test("the invite API refuses to run in demo mode", async ({ request }) => {
    const response = await request.post("/api/broker-team/invite", {
      headers: { "content-type": "application/json" },
      data: { email: "colleague@example-synthetic.co.za", role: "broker_agent" },
    });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Team invitations require Supabase mode");
  });
});
