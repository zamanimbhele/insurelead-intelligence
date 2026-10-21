import { describe, expect, it } from "vitest";
import { formatDueSast, groupTaskDigests, renderTaskDigestEmail, sastDay, type TaskDigestRow } from "./task-digest";

const now = new Date("2026-10-21T04:00:00Z"); // 06:00 SAST on 21 Oct

function row(overrides: Partial<TaskDigestRow>): TaskDigestRow {
  return {
    profileId: "p1",
    email: "thandi@discovery.test",
    displayName: "Thandi Nkosi",
    taskId: "t1",
    taskTitle: "Call back about renewal",
    dueAt: "2026-10-21T08:00:00Z",
    leadId: "lead-1",
    leadLabel: "Acme Traders",
    leadDoNotContact: false,
    ...overrides,
  };
}

describe("sastDay", () => {
  it("uses the South African calendar day", () => {
    expect(sastDay(now)).toEqual({
      date: "2026-10-21",
      start: new Date("2026-10-20T22:00:00Z"),
      end: new Date("2026-10-21T22:00:00Z"),
    });
    expect(sastDay(new Date("2026-10-21T22:30:00Z")).date).toBe("2026-10-22");
  });
});

describe("groupTaskDigests", () => {
  it("splits each recipient's tasks into overdue and due today, oldest first", () => {
    const digests = groupTaskDigests([
      row({ taskId: "today-late", dueAt: "2026-10-21T15:00:00Z" }),
      row({ taskId: "overdue", dueAt: "2026-10-19T09:00:00Z" }),
      row({ taskId: "today-early", dueAt: "2026-10-20T22:30:00Z" }), // 00:30 SAST today
      row({ taskId: "yesterday-late", dueAt: "2026-10-20T21:30:00Z" }), // 23:30 SAST yesterday
      row({ profileId: "p2", email: "sipho@discovery.test", taskId: "agent-task" }),
    ], now);
    expect(digests).toHaveLength(2);
    const [admin, agent] = digests;
    expect(admin.overdue.map((item) => item.taskId)).toEqual(["overdue", "yesterday-late"]);
    expect(admin.dueToday.map((item) => item.taskId)).toEqual(["today-early", "today-late"]);
    expect(agent.dueToday.map((item) => item.taskId)).toEqual(["agent-task"]);
  });

  it("ignores tasks due after today and recipients left with nothing", () => {
    expect(groupTaskDigests([row({ dueAt: "2026-10-22T08:00:00Z" })], now)).toEqual([]);
  });
});

describe("renderTaskDigestEmail", () => {
  it("summarises counts in the subject and links each task to its lead", () => {
    const [digest] = groupTaskDigests([
      row({ taskId: "a", dueAt: "2026-10-19T09:00:00Z" }),
      row({ taskId: "b" }),
    ], now);
    const email = renderTaskDigestEmail(digest, { appUrl: "https://insurelead.online", date: "2026-10-21" });
    expect(email.subject).toBe("1 overdue, 1 due today: your InsureLead follow-ups");
    expect(email.text).toContain("Hi Thandi,");
    expect(email.text).toContain("Overdue (1)");
    expect(email.text).toContain("- Call back about renewal - Acme Traders, due 19/10 11:00");
    expect(email.html).toContain('href="https://insurelead.online/dashboard/leads/lead-1"');
    expect(email.html).toContain("Manage digest");
  });

  it("uses a simpler subject when nothing is overdue", () => {
    const [digest] = groupTaskDigests([row({})], now);
    expect(renderTaskDigestEmail(digest, { appUrl: "https://insurelead.online", date: "2026-10-21" }).subject)
      .toBe("1 follow-up due today on InsureLead");
  });

  it("escapes task text and flags Do Not Contact leads", () => {
    const [digest] = groupTaskDigests([
      row({ taskTitle: '<img src=x onerror="alert(1)">', leadLabel: "Smith & Sons", leadDoNotContact: true }),
    ], now);
    const email = renderTaskDigestEmail(digest, { appUrl: "https://insurelead.online", date: "2026-10-21" });
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.html).toContain("Smith &amp; Sons");
    expect(email.html).toContain("Do Not Contact: close or cancel this task");
  });

  it("formats due times in SAST", () => {
    expect(formatDueSast("2026-10-21T22:15:00Z")).toBe("22/10 00:15");
  });
});
