import { describe, expect, it } from "vitest";
import { buildFollowUpQueue, followUpBucket, summariseTeamActivity, UNASSIGNED } from "./follow-ups";
import type { Lead, LeadActivity, LeadTask } from "./types";

const now = new Date("2026-11-13T08:00:00Z"); // 10:00 SAST on 13 Nov

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: "lead-1",
    contactFullName: "Test Person",
    status: "contacted",
    doNotContact: false,
    ...overrides,
  } as Lead;
}

function task(overrides: Partial<LeadTask>): LeadTask {
  return { id: "t1", leadId: "lead-1", title: "Call back", status: "open", createdAt: "2026-11-01T08:00:00Z", ...overrides };
}

function activity(overrides: Partial<LeadActivity>): LeadActivity {
  return {
    id: "a1",
    leadId: "lead-1",
    kind: "interaction_logged",
    summary: "Called",
    actorLabel: "Sipho Khumalo",
    occurredAt: "2026-11-12T09:00:00Z",
    ...overrides,
  };
}

describe("followUpBucket", () => {
  it("uses the South African calendar day", () => {
    expect(followUpBucket("2026-11-12T21:59:00Z", now)).toBe("overdue"); // 23:59 SAST on 12 Nov
    expect(followUpBucket("2026-11-12T22:00:00Z", now)).toBe("today"); // 00:00 SAST on 13 Nov
    expect(followUpBucket("2026-11-13T21:59:00Z", now)).toBe("today");
    expect(followUpBucket("2026-11-13T22:00:00Z", now)).toBe("next_7_days");
    expect(followUpBucket("2026-11-20T21:59:00Z", now)).toBe("next_7_days");
    expect(followUpBucket("2027-02-13T08:00:00Z", now)).toBe("later");
    expect(followUpBucket(undefined, now)).toBe("undated");
    expect(followUpBucket("not a date", now)).toBe("undated");
  });
});

describe("buildFollowUpQueue", () => {
  it("keeps open tasks on visible leads, soonest first, undated last", () => {
    const queue = buildFollowUpQueue(
      [
        task({ id: "undated" }),
        task({ id: "later", dueAt: "2027-02-13T08:00:00Z", title: "Call in three months" }),
        task({ id: "overdue", dueAt: "2026-11-10T08:00:00Z", assigneeLabel: "  Sipho Khumalo " }),
        task({ id: "done", dueAt: "2026-11-10T08:00:00Z", status: "completed" }),
        task({ id: "hidden", leadId: "another-organisations-lead", dueAt: "2026-11-10T08:00:00Z" }),
        task({ id: "erased", leadId: "lead-2", dueAt: "2026-11-10T08:00:00Z" }),
      ],
      [lead({ businessName: "Acme Traders" }), lead({ id: "lead-2", deletedAt: "2026-11-01T00:00:00Z" })],
      now,
    );
    expect(queue.map((item) => item.taskId)).toEqual(["overdue", "later", "undated"]);
    expect(queue[0]).toMatchObject({ leadLabel: "Acme Traders", assigneeLabel: "Sipho Khumalo", bucket: "overdue" });
    expect(queue[1].bucket).toBe("later");
  });

  it("flags a do-not-contact lead and falls back to the contact name", () => {
    const [item] = buildFollowUpQueue([task({})], [lead({ doNotContact: true })], now);
    expect(item).toMatchObject({ leadLabel: "Test Person", leadDoNotContact: true });
  });
});

describe("summariseTeamActivity", () => {
  const since = new Date("2026-11-06T08:00:00Z");

  it("counts each person's recorded work in the period and their open follow-ups", () => {
    const queue = buildFollowUpQueue(
      [
        task({ id: "a", dueAt: "2026-11-10T08:00:00Z", assigneeLabel: "sipho khumalo" }),
        task({ id: "b", dueAt: "2026-11-20T08:00:00Z", assigneeLabel: "Sipho Khumalo" }),
        task({ id: "c" }),
      ],
      [lead({})],
      now,
    );
    const rows = summariseTeamActivity(
      [
        activity({ id: "1", metadata: { outcome: "connected" } }),
        activity({ id: "2", metadata: { outcome: "no_answer" }, occurredAt: "2026-11-12T10:00:00Z" }),
        activity({ id: "3", kind: "note_added" }),
        activity({ id: "4", kind: "task_completed" }),
        activity({ id: "5", kind: "status_change", actorLabel: "Johan van der Merwe" }),
        activity({ id: "6", kind: "task_created", actorLabel: "Somebody Else" }), // not counted as work done
        activity({ id: "7", occurredAt: "2026-11-01T09:00:00Z" }), // before the period
      ],
      queue,
      since,
    );
    expect(rows).toEqual([
      {
        person: "Johan van der Merwe", contactsLogged: 0, connected: 0, notes: 0, followUpsCompleted: 0, stageChanges: 1,
        lastActiveAt: "2026-11-12T09:00:00Z", openFollowUps: 0, overdueFollowUps: 0,
      },
      {
        person: "Sipho Khumalo", contactsLogged: 2, connected: 1, notes: 1, followUpsCompleted: 1, stageChanges: 0,
        lastActiveAt: "2026-11-12T10:00:00Z", openFollowUps: 2, overdueFollowUps: 1,
      },
      {
        person: UNASSIGNED, contactsLogged: 0, connected: 0, notes: 0, followUpsCompleted: 0, stageChanges: 0,
        openFollowUps: 1, overdueFollowUps: 0,
      },
    ]);
  });

  it("returns nothing when there is no work and no open follow-up", () => {
    expect(summariseTeamActivity([], [], since)).toEqual([]);
  });
});
