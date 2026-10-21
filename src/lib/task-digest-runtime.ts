// Daily task digest: who gets what, in both data modes, and the send run.
import type { DashboardIdentity } from "./auth.ts";
import { DEMO_ROLE_ACCOUNTS } from "./constants.ts";
import { getAllLeadTasks, getDemoTaskDigestPreference, getLeadById } from "./demo-store.ts";
import { createSupabaseAdminClient } from "./supabase/admin.ts";
import { getDataMode } from "./supabase/config.ts";
import {
  claimSupabaseTaskDigestDelivery,
  completeSupabaseTaskDigestDelivery,
  fetchOwnTaskDigestPreference,
  fetchSupabaseTaskDigestRows,
} from "./supabase/task-digest-data.ts";
import { groupTaskDigests, renderTaskDigestEmail, sastDay, type TaskDigest, type TaskDigestRow } from "./task-digest.ts";
import { getTransactionalEmailStatus, sendTransactionalEmail } from "./transactional-email.ts";

export const DIGEST_ROLES = ["broker_admin", "broker_agent"] as const;

function requireAdminClient() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("The task digest requires the server-only Supabase secret key");
  return client;
}

// Demo mode has no organisation tenancy or allocations (see BACKLOG.md),
// so a demo broker admin sees every open due task and a demo broker
// agent sees tasks whose assignee matches their name or email.
function demoDigestRows(now: Date): TaskDigestRow[] {
  const { end } = sastDay(now);
  const tasks = getAllLeadTasks().filter((task) =>
    task.status === "open" && task.dueAt && new Date(task.dueAt) < end);
  const rows: TaskDigestRow[] = [];
  for (const account of DEMO_ROLE_ACCOUNTS) {
    if (!(DIGEST_ROLES as readonly string[]).includes(account.role)) continue;
    if (!getDemoTaskDigestPreference(account.email)) continue;
    for (const task of tasks) {
      const assignee = task.assigneeLabel?.trim().toLowerCase();
      const mine = account.role === "broker_admin"
        || assignee === account.displayName.toLowerCase()
        || assignee === account.email.toLowerCase();
      if (!mine) continue;
      const lead = getLeadById(task.leadId);
      if (!lead || lead.deletedAt) continue;
      rows.push({
        profileId: `demo:${account.role}`,
        email: account.email,
        displayName: account.displayName,
        taskId: task.id,
        taskTitle: task.title,
        dueAt: task.dueAt as string,
        assigneeLabel: task.assigneeLabel,
        leadId: lead.id,
        leadLabel: lead.businessName?.trim() || lead.contactFullName.trim().split(/\s+/)[0] || "Lead",
        leadDoNotContact: lead.doNotContact,
      });
    }
  }
  return rows;
}

export async function getTaskDigestPreview(identity: DashboardIdentity, now = new Date()): Promise<{
  eligible: boolean;
  enabled: boolean;
  digest?: TaskDigest;
}> {
  if (!(DIGEST_ROLES as readonly string[]).includes(identity.role)) return { eligible: false, enabled: false };
  if (getDataMode() === "demo") {
    const enabled = getDemoTaskDigestPreference(identity.email ?? "");
    const digest = groupTaskDigests(demoDigestRows(now), now).find((item) => item.email === identity.email);
    return { eligible: true, enabled, digest };
  }
  if (!identity.userId) return { eligible: false, enabled: false };
  const client = requireAdminClient();
  const enabled = await fetchOwnTaskDigestPreference(client, identity.userId);
  // Own rows only (p_profile_id), so this never reveals anyone else's tasks.
  const rows = enabled ? await fetchSupabaseTaskDigestRows(client, sastDay(now).end, identity.userId) : [];
  return { eligible: true, enabled, digest: groupTaskDigests(rows, now)[0] };
}

export type TaskDigestRunSummary = {
  date: string;
  recipients: number;
  sent: number;
  failed: number;
  alreadySent: number;
  status: "sent" | "demo" | "email-not-configured";
};

// One run per morning. Safe to repeat: each person is claimed in
// task_digest_deliveries before sending, so a second run (or an
// overlapping one) skips anyone already handled today.
export async function runTaskDigest(now = new Date()): Promise<TaskDigestRunSummary> {
  const { date, end } = sastDay(now);
  if (getDataMode() === "demo") {
    const digests = groupTaskDigests(demoDigestRows(now), now);
    return { date, recipients: digests.length, sent: 0, failed: 0, alreadySent: 0, status: "demo" };
  }
  if (getTransactionalEmailStatus() !== "configured") {
    return { date, recipients: 0, sent: 0, failed: 0, alreadySent: 0, status: "email-not-configured" };
  }

  const client = requireAdminClient();
  const digests = groupTaskDigests(await fetchSupabaseTaskDigestRows(client, end), now);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://insurelead.online";
  const summary: TaskDigestRunSummary = {
    date, recipients: digests.length, sent: 0, failed: 0, alreadySent: 0, status: "sent",
  };

  for (const digest of digests) {
    const deliveryId = await claimSupabaseTaskDigestDelivery(client, {
      profileId: digest.profileId,
      digestDate: date,
      taskCount: digest.overdue.length + digest.dueToday.length,
    });
    if (!deliveryId) {
      summary.alreadySent += 1;
      continue;
    }
    try {
      const email = renderTaskDigestEmail(digest, { appUrl, date });
      const result = await sendTransactionalEmail({
        to: digest.email,
        ...email,
        idempotencyKey: `task-digest-${digest.profileId}-${date}`,
        tag: "task_digest",
      });
      await completeSupabaseTaskDigestDelivery(client, deliveryId, { status: "sent", providerMessageId: result.providerMessageId });
      summary.sent += 1;
    } catch (error) {
      await completeSupabaseTaskDigestDelivery(client, deliveryId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Delivery failed",
      });
      summary.failed += 1;
    }
  }
  return summary;
}
