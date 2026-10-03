import { test, expect } from "@playwright/test";

// Resolves a stable lead profile URL from the Leads table rather than
// hard-coding a demo seed ID, so this spec still passes if the seed data
// changes shape later (see lead-pipeline.spec.ts for the same rationale).
async function firstLeadProfileHref(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/leads");
  const href = await page.locator("a[href^='/dashboard/leads/']").first().getAttribute("href");
  if (!href) throw new Error("Could not resolve a lead profile link from the Leads table");
  return href;
}

test.describe("Lead activity workflow (synthetic demo data)", () => {
  test("adding a note appears in the activity timeline", async ({ page }) => {
    const href = await firstLeadProfileHref(page);
    await page.goto(href);

    await expect(page.getByRole("heading", { name: "Notes & Interactions" })).toBeVisible();

    const noteText = `E2E note ${Date.now()}`;
    await page.getByPlaceholder("Add a note for this lead...").fill(noteText);
    await page.getByRole("button", { name: "Add note" }).click();

    await expect(page.getByText(noteText)).toBeVisible();

    await page.reload();
    await expect(page.getByText(noteText)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity Timeline" })).toBeVisible();
    await expect(page.getByText("Note added")).toBeVisible();
  });

  test("logging an interaction records it on the timeline", async ({ page }) => {
    const href = await firstLeadProfileHref(page);
    await page.goto(href);

    const summary = `Discussed renewal timing ${Date.now()}`;
    await page.getByPlaceholder("What was discussed?").fill(summary);
    await page.getByRole("button", { name: "Log interaction" }).click();

    await expect(page.getByText(summary)).toBeVisible();
  });

  test("creating and completing a follow-up task updates both the task list and the timeline", async ({ page }) => {
    const href = await firstLeadProfileHref(page);
    await page.goto(href);

    const title = `Call back about cover ${Date.now()}`;
    await page.getByPlaceholder("e.g. Call to confirm renewal date").fill(title);
    await page.getByRole("button", { name: "Add task" }).click();

    // Scoped to the Follow-up Tasks section specifically: a plain
    // `page.locator("li", { hasText: title })` also matches the "Task
    // created: <title>" entry the same action adds to the Activity
    // Timeline section below, which is a strict-mode violation (two <li>
    // elements both contain the task title text).
    const tasksSection = page.locator("section", { has: page.getByRole("heading", { name: "Follow-up Tasks" }) });
    const taskRow = tasksSection.locator("li", { hasText: title });
    await expect(taskRow).toBeVisible();

    await taskRow.getByRole("button", { name: "Complete" }).click();
    await expect(taskRow).not.toBeVisible();
    await expect(page.getByText(`Task completed: ${title}`)).toBeVisible();
  });

  test("moving a lead to Lost requires a loss reason", async ({ page }) => {
    const href = await firstLeadProfileHref(page);
    await page.goto(href);

    await expect(page.getByRole("heading", { name: "Pipeline & Outcome" })).toBeVisible();
    const statusSelect = page.getByLabel("Status");
    const originalStatus = await statusSelect.inputValue();

    await statusSelect.selectOption("lost");
    // No loss reason entered yet - the inline Save button should reject it
    // client-side without a round trip.
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("A loss reason is required when marking a lead as lost")).toBeVisible();

    const reason = `Chose a competitor ${Date.now()}`;
    await page.getByPlaceholder("e.g. Went with an existing broker").fill(reason);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(`Status changed to Lost: ${reason}`)).toBeVisible();

    // Revert so the demo dataset is unchanged for the next local run.
    await statusSelect.selectOption(originalStatus);
    await expect(statusSelect).toHaveValue(originalStatus);
  });
});
