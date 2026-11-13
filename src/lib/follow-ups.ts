// Follow-up workspace: the callback queue across every lead a person can
// see, and a per-person summary of recent work (pure, unit-tested).
//
// "Today" is the South African calendar day, as in the daily task digest.
import { sastDay } from "./task-digest.ts";
import type { Lead, LeadActivity, LeadStatus, LeadTask } from "./types.ts";

export type FollowUpBucket = "overdue" | "today" | "next_7_days" | "later" | "undated";

export const FOLLOW_UP_BUCKETS: { key: FollowUpBucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "next_7_days", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "undated", label: "No due date" },
];

export type FollowUpItem = {
  taskId: string;
  leadId: string;
  title: string;
  dueAt?: string;
  assigneeLabel?: string;
  leadLabel: string;
  leadStatus: LeadStatus;
  leadDoNotContact: boolean;
  bucket: FollowUpBucket;
};

export const UNASSIGNED = "Unassigned";

export function followUpBucket(dueAt: string | undefined, now: Date): FollowUpBucket {
  if (!dueAt) return "undated";
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return "undated";
  const { start, end } = sastDay(now);
  if (due < start.getTime()) return "overdue";
  if (due < end.getTime()) return "today";
  if (due < end.getTime() + 7 * 86_400_000) return "next_7_days";
  return "later";
}

function leadLabel(lead: Lead) {
  return lead.businessName?.trim() || lead.contactFullName.trim() || "Lead";
}

// Open tasks only, soonest first; tasks with no date go last. A task whose
// lead the viewer cannot see (or whose personal details were erased) is
// left out, so the queue never shows more than the Leads page does.
export function buildFollowUpQueue(tasks: LeadTask[], leads: Lead[], now: Date): FollowUpItem[] {
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const items: FollowUpItem[] = [];
  for (const task of tasks) {
    if (task.status !== "open") continue;
    const lead = byId.get(task.leadId);
    if (!lead || lead.deletedAt) continue;
    items.push({
      taskId: task.id,
      leadId: lead.id,
      title: task.title,
      dueAt: task.dueAt,
      assigneeLabel: task.assigneeLabel?.trim() || undefined,
      leadLabel: leadLabel(lead),
      leadStatus: lead.status,
      leadDoNotContact: lead.doNotContact,
      bucket: followUpBucket(task.dueAt, now),
    });
  }
  const time = (item: FollowUpItem) =>
    item.bucket === "undated" ? Number.POSITIVE_INFINITY : new Date(item.dueAt as string).getTime();
  return items.sort((a, b) => {
    const [first, second] = [time(a), time(b)];
    if (first !== second) return first < second ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export type TeamActivityRow = {
  person: string;
  contactsLogged: number;
  connected: number;
  notes: number;
  followUpsCompleted: number;
  stageChanges: number;
  lastActiveAt?: string;
  openFollowUps: number;
  overdueFollowUps: number;
};

const personKey = (label: string) => label.trim().toLowerCase();

// One row per person: what they recorded since `since`, and the follow-ups
// currently assigned to them. Names are matched ignoring case, because a
// task's assignee is typed free text.
export function summariseTeamActivity(activities: LeadActivity[], queue: FollowUpItem[], since: Date): TeamActivityRow[] {
  const rows = new Map<string, TeamActivityRow>();
  const rowFor = (label: string) => {
    const person = label.trim() || UNASSIGNED;
    let row = rows.get(personKey(person));
    if (!row) {
      row = { person, contactsLogged: 0, connected: 0, notes: 0, followUpsCompleted: 0, stageChanges: 0, openFollowUps: 0, overdueFollowUps: 0 };
      rows.set(personKey(person), row);
    }
    return row;
  };

  for (const activity of activities) {
    if (new Date(activity.occurredAt).getTime() < since.getTime()) continue;
    if (!["interaction_logged", "note_added", "task_completed", "status_change"].includes(activity.kind)) continue;
    const row = rowFor(activity.actorLabel);
    if (activity.kind === "interaction_logged") {
      row.contactsLogged += 1;
      if (activity.metadata?.outcome === "connected") row.connected += 1;
    } else if (activity.kind === "note_added") row.notes += 1;
    else if (activity.kind === "task_completed") row.followUpsCompleted += 1;
    else row.stageChanges += 1;
    if (!row.lastActiveAt || activity.occurredAt > row.lastActiveAt) row.lastActiveAt = activity.occurredAt;
  }

  for (const item of queue) {
    const row = rowFor(item.assigneeLabel ?? UNASSIGNED);
    row.openFollowUps += 1;
    if (item.bucket === "overdue") row.overdueFollowUps += 1;
  }

  return [...rows.values()].sort((a, b) => {
    const [first, second] = [a.person === UNASSIGNED ? 1 : 0, b.person === UNASSIGNED ? 1 : 0];
    return first - second || a.person.localeCompare(b.person);
  });
}
