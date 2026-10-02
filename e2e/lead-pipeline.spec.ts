import { test, expect } from "@playwright/test";

test.describe("Lead pipeline Kanban board (synthetic demo data)", () => {
  test("switching to Kanban view shows every pipeline stage with the right lead counts", async ({ page }) => {
    await page.goto("/dashboard/leads");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();

    const totalLeadsText = await page.getByText(/total demo leads/).textContent();
    const totalLeads = Number(totalLeadsText?.match(/\((\d+) total/)?.[1] ?? "0");
    expect(totalLeads).toBeGreaterThan(0);

    await page.getByRole("tab", { name: "Kanban" }).click();

    const columnHeadings = [
      "New", "Contact Attempted", "Contacted", "Qualified", "Consultation Booked",
      "Quote Requested", "Quote Issued", "Negotiation", "Won", "Lost", "Nurture",
      "Do Not Contact", "Archived",
    ];
    for (const heading of columnHeadings) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    // Every card's per-column count should sum back to the leads list total,
    // confirming every lead landed in exactly one column.
    const counts = await page.locator("section header span").allTextContents();
    const sum = counts.reduce((total, value) => total + Number(value), 0);
    expect(sum).toBe(totalLeads);
  });

  test("moving a lead between stages via the accessible control persists and can be reverted", async ({ page }) => {
    await page.goto("/dashboard/leads");
    await page.getByRole("tab", { name: "Kanban" }).click();

    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible();
    const select = firstCard.getByLabel(/Move .* to a different pipeline stage/);
    const originalStatus = await select.inputValue();
    const nextStatus = originalStatus === "qualified" ? "contacted" : "qualified";

    await select.selectOption(nextStatus);
    await expect(select).toHaveValue(nextStatus);

    // Reload to confirm the change was persisted server-side, not just local state.
    await page.reload();
    await page.getByRole("tab", { name: "Kanban" }).click();
    const movedCard = page.locator("article").filter({ hasText: await firstCard.locator("span.truncate").first().textContent() ?? "" }).first();
    await expect(movedCard.getByLabel(/Move .* to a different pipeline stage/)).toHaveValue(nextStatus);

    // Revert so the demo dataset is unchanged for the next local run.
    await movedCard.getByLabel(/Move .* to a different pipeline stage/).selectOption(originalStatus);
    await expect(movedCard.getByLabel(/Move .* to a different pipeline stage/)).toHaveValue(originalStatus);
  });
});
