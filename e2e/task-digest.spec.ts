import { expect, test, type Page } from "@playwright/test";

// Daily task digest (task-digest.ts, task-digest-runtime.ts). Demo mode
// never sends email; the Broker Profile page previews exactly what today's
// digest would contain, which is what these tests check. Every task this
// spec creates is completed again at the end so later specs see the seed.
const LEAD_ID = "lead_0001"; // seeded "Baobab Technologies"

async function switchRole(page: Page, role: string, displayName: string) {
  await page.goto("/dashboard");
  await page.getByLabel("Viewing as (demo role)").selectOption(role);
  await expect(page.getByRole("complementary").getByText(displayName)).toBeVisible();
}

async function createTask(page: Page, title: string, dueAt: string, assigneeLabel?: string) {
  const response = await page.request.post(`/api/leads/${LEAD_ID}/tasks`, { data: { title, dueAt, assigneeLabel } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).task.id as string;
}

async function completeTask(page: Page, taskId: string) {
  const response = await page.request.post(`/api/leads/${LEAD_ID}/tasks/${taskId}`, { data: { status: "completed" } });
  expect(response.ok()).toBeTruthy();
}

test.describe("Daily task digest (synthetic demo data)", () => {
  test("a broker admin's preview lists overdue and due-today tasks, linked to the lead", async ({ page }) => {
    await switchRole(page, "broker_admin", "Johan van der Merwe");
    const stamp = Date.now();
    const overdueId = await createTask(page, `Overdue follow-up ${stamp}`, new Date(Date.now() - 2 * 86_400_000).toISOString());
    const futureId = await createTask(page, `Next week follow-up ${stamp}`, new Date(Date.now() + 7 * 86_400_000).toISOString());
    try {
      await page.goto("/dashboard/broker-profile");
      const preview = page.getByTestId("task-digest-preview");
      await expect(preview.getByText(/^Overdue \(\d+\)$/)).toBeVisible();
      const overdueLink = preview.getByRole("link", { name: `Overdue follow-up ${stamp}` });
      await expect(overdueLink).toHaveAttribute("href", `/dashboard/leads/${LEAD_ID}`);
      await expect(preview.getByText(`Next week follow-up ${stamp}`)).toHaveCount(0);
    } finally {
      await completeTask(page, overdueId);
      await completeTask(page, futureId);
      await page.context().clearCookies();
    }
  });

  test("a broker agent only sees tasks assigned to them", async ({ page }) => {
    await switchRole(page, "broker_admin", "Johan van der Merwe");
    const stamp = Date.now();
    const due = new Date(Date.now() - 3_600_000).toISOString();
    const otherId = await createTask(page, `For someone else ${stamp}`, due, "Somebody Else");
    await switchRole(page, "broker_agent", "Sipho Khumalo");
    const mineId = await createTask(page, `For Sipho ${stamp}`, due, "Sipho Khumalo");
    try {
      await page.goto("/dashboard/broker-profile");
      const preview = page.getByTestId("task-digest-preview");
      await expect(preview.getByRole("link", { name: `For Sipho ${stamp}` })).toBeVisible();
      await expect(preview.getByText(`For someone else ${stamp}`)).toHaveCount(0);
    } finally {
      await completeTask(page, mineId);
      await completeTask(page, otherId);
      await page.context().clearCookies();
    }
  });

  test("a broker can switch the digest off and on again", async ({ page }) => {
    await switchRole(page, "broker_admin", "Johan van der Merwe");
    await page.goto("/dashboard/broker-profile");
    const card = page.getByTestId("task-digest-card");
    const toggle = card.getByLabel("Email me the digest");
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(card.getByText("The digest is switched off.")).toBeVisible();
    await page.reload();
    await expect(card.getByLabel("Email me the digest")).not.toBeChecked();
    await card.getByLabel("Email me the digest").check();
    await expect(card.getByText("The digest is switched off.")).toHaveCount(0);
    await page.context().clearCookies();
  });

  test("roles without follow-up tasks do not get the digest", async ({ page }) => {
    await page.goto("/dashboard/broker-profile");
    await expect(page.getByTestId("task-digest-card")).toHaveCount(0);
    const response = await page.request.post("/api/notifications/task-digest", { data: { enabled: false } });
    expect(response.status()).toBe(403);
  });

  test("the digest endpoint refuses to run without a configured secret", async ({ request }) => {
    const response = await request.get("/api/cron/task-digest", {
      headers: { Authorization: "Bearer not-the-secret-not-the-secret" },
    });
    expect(response.status()).toBe(503);
  });
});
