import { expect, test, type Page } from "@playwright/test";

// Staff "New lead" form (/dashboard/leads/new, POST /api/leads/staff): a
// broker operator records a lead taken by phone or referral. Demo mode has
// no organisations, so these tests cover the form, the server-side checks
// and the role gate; the tenancy rules are covered against the real
// database functions in src/lib/staff-lead-db.test.ts.

async function switchRole(page: Page, role: string, displayName: string) {
  await page.goto("/dashboard");
  await page.getByLabel("Viewing as (demo role)").selectOption(role);
  await expect(page.getByRole("complementary").getByText(displayName)).toBeVisible();
}

// A different synthetic mobile number per run, so reruns never collide.
function uniqueMobile() {
  return `07${String(Date.now()).slice(-8)}`;
}

async function fillLead(page: Page, name: string, mobile: string) {
  const form = page.getByTestId("new-lead-form");
  await form.getByLabel("Full name").fill(name);
  await form.getByLabel("Mobile number").fill(mobile);
  await form.getByLabel("Province").selectOption("Gauteng");
  await form.getByLabel("City or town").fill("Johannesburg");
  await form.getByLabel("Life Insurance").check();
  await form.getByLabel("How did they agree to be contacted?").selectOption("direct_enquiry");
}

test.describe("Staff new lead form (synthetic demo data)", () => {
  test("a broker agent adds a phone lead and is warned about a duplicate", async ({ page }) => {
    await switchRole(page, "broker_agent", "Sipho Khumalo");
    const name = `Synthetic Caller ${Date.now()}`;
    const mobile = uniqueMobile();
    try {
      await page.goto("/dashboard/leads");
      await page.getByRole("link", { name: "Add lead" }).click();
      await expect(page.getByRole("heading", { name: "New lead", level: 1 })).toBeVisible();

      // Without the permission confirmation the server refuses the lead.
      await fillLead(page, name, mobile);
      await page.getByRole("button", { name: "Add lead" }).click();
      await expect(page.getByText("Confirm that this person agreed to be contacted")).toBeVisible();

      await page.getByLabel("I confirm this person agreed to be contacted by our practice about insurance.").check();
      await page.getByRole("button", { name: "Add lead" }).click();
      await expect(page).toHaveURL(/\/dashboard\/leads\/lead_staff_/);
      await expect(page.getByText(name).first()).toBeVisible();
      await expect(page.getByText("Lead added by a team member")).toBeVisible();

      // The same number again, written in international form, is a duplicate.
      await page.goto("/dashboard/leads/new");
      await fillLead(page, `${name} again`, `+27${mobile.slice(1)}`);
      await page.getByLabel("I confirm this person agreed to be contacted by our practice about insurance.").check();
      await page.getByRole("button", { name: "Add lead" }).click();
      await expect(page.getByTestId("new-lead-error")).toContainText("already in your workspace");
      await expect(page.getByRole("link", { name: "Open the existing lead" })).toHaveAttribute("href", /\/dashboard\/leads\/lead_staff_/);
    } finally {
      await page.context().clearCookies();
    }
  });

  test("the server ignores an organisation or score sent with the request, and refuses other roles", async ({ page }) => {
    const lead = {
      applicantType: "individual",
      contactFullName: "Synthetic Direct Caller",
      contactMobile: uniqueMobile(),
      preferredContactChannel: "phone",
      province: "Gauteng",
      city: "Pretoria",
      insuranceProducts: ["life_insurance"],
      contactBasis: "referral",
      contactPermissionConfirmed: true,
    };
    try {
      await switchRole(page, "broker_admin", "Johan van der Merwe");
      const tampered = await page.request.post("/api/leads/staff", { data: { ...lead, organisationId: "another-organisation", score: 100 } });
      expect(tampered.status()).toBe(400);

      await switchRole(page, "campaign_manager", "Aisha Patel");
      await page.goto("/dashboard/leads");
      await expect(page.getByRole("link", { name: "Add lead" })).toHaveCount(0);
      expect((await page.request.post("/api/leads/staff", { data: lead })).status()).toBe(403);
      await page.goto("/dashboard/leads/new");
      await expect(page).toHaveURL(/\/dashboard\/leads$/);

      await switchRole(page, "platform_admin", "Thandiwe Mokoena");
      expect((await page.request.post("/api/leads/staff", { data: lead })).status()).toBe(403);
    } finally {
      await page.context().clearCookies();
    }
  });
});
