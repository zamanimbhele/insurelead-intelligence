import { expect, test, type Page } from "@playwright/test";

// Follow-up workspace (/dashboard/follow-ups): the queue of open follow-ups
// across every lead, and the team activity table for the person who runs
// the practice. Every task this spec creates is completed again at the end
// so later specs see the seed data.
const LEAD_ID = "lead_0001"; // seeded "Baobab Technologies"

async function switchRole(page: Page, role: string, displayName: string) {
  await page.goto("/dashboard");
  await page.getByLabel("Viewing as (demo role)").selectOption(role);
  await expect(page.getByRole("complementary").getByText(displayName)).toBeVisible();
}

async function createTask(page: Page, title: string, dueAt: string | undefined, assigneeLabel?: string) {
  const response = await page.request.post(`/api/leads/${LEAD_ID}/tasks`, { data: { title, dueAt, assigneeLabel } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).task.id as string;
}

async function completeTask(page: Page, taskId: string) {
  await page.request.post(`/api/leads/${LEAD_ID}/tasks/${taskId}`, { data: { status: "completed" } });
}

test.describe("Follow-up workspace (synthetic demo data)", () => {
  test("lists open follow-ups by when they are due, and one can be marked done", async ({ page }) => {
    await switchRole(page, "broker_admin", "Johan van der Merwe");
    const stamp = Date.now();
    const overdueId = await createTask(page, `Overdue callback ${stamp}`, new Date(Date.now() - 2 * 86_400_000).toISOString(), "Sipho Khumalo");
    const laterId = await createTask(page, `Call in three months ${stamp}`, new Date(Date.now() + 90 * 86_400_000).toISOString());
    try {
      await page.goto("/dashboard/follow-ups");
      await expect(page.getByRole("heading", { name: "Follow-ups", level: 1 })).toBeVisible();

      const overdue = page.getByTestId("follow-ups-overdue");
      const overdueLink = overdue.getByRole("link", { name: `Overdue callback ${stamp}` });
      await expect(overdueLink).toHaveAttribute("href", `/dashboard/leads/${LEAD_ID}`);
      await expect(page.getByTestId("follow-ups-later").getByText(`Call in three months ${stamp}`)).toBeVisible();

      // The assignee filter narrows the queue to one person's work.
      await page.getByLabel("Assigned to").selectOption("Sipho Khumalo");
      await expect(overdueLink).toBeVisible();
      await expect(page.getByText(`Call in three months ${stamp}`)).toHaveCount(0);

      await overdue.getByRole("listitem").filter({ hasText: `Overdue callback ${stamp}` }).getByRole("button", { name: "Mark done" }).click();
      await expect(page.getByText(`Overdue callback ${stamp}`)).toHaveCount(0);
    } finally {
      await completeTask(page, overdueId);
      await completeTask(page, laterId);
      await page.context().clearCookies();
    }
  });

  test("the practice owner sees team activity; an agent sees the queue only", async ({ page }) => {
    await switchRole(page, "broker_agent", "Sipho Khumalo");
    const stamp = Date.now();
    const logged = await page.request.post(`/api/leads/${LEAD_ID}/interactions`, {
      data: { channel: "call", outcome: "connected", summary: `Spoke about renewal ${stamp}` },
    });
    expect(logged.ok()).toBeTruthy();
    try {
      await page.goto("/dashboard/follow-ups");
      await expect(page.getByTestId("follow-up-queue")).toBeVisible();
      await expect(page.getByTestId("team-activity")).toHaveCount(0);

      await switchRole(page, "broker_admin", "Johan van der Merwe");
      await page.goto("/dashboard/follow-ups");
      const row = page.getByTestId("team-activity").getByRole("row", { name: /Sipho Khumalo/ });
      await expect(row).toBeVisible();
      // Contacts logged is the first number in the row and is at least 1.
      await expect(row.getByRole("cell").first()).not.toHaveText("0");
    } finally {
      await page.context().clearCookies();
    }
  });
});
