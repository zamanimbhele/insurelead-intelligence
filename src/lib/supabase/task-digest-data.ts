import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskDigestRow } from "../task-digest.ts";

// Data access for the daily task digest (migration 202610210003).

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

type DigestRpcRow = {
  profile_id: string;
  email: string | null;
  display_name: string | null;
  task_id: string;
  task_title: string;
  due_at: string;
  assignee_label: string | null;
  lead_id: string;
  lead_label: string | null;
  lead_do_not_contact: boolean;
};

// Service-role client only (the function reads auth.users for emails).
export async function fetchSupabaseTaskDigestRows(
  client: SupabaseClient,
  dueBefore: Date,
  profileId?: string,
): Promise<TaskDigestRow[]> {
  const { data, error } = await client.rpc("task_digest_rows", {
    p_due_before: dueBefore.toISOString(),
    p_profile_id: profileId ?? null,
  });
  fail("Unable to load task digest rows", error);
  return ((data ?? []) as DigestRpcRow[])
    .filter((row) => row.email)
    .map((row) => ({
      profileId: row.profile_id,
      email: row.email as string,
      displayName: row.display_name ?? undefined,
      taskId: row.task_id,
      taskTitle: row.task_title,
      dueAt: row.due_at,
      assigneeLabel: row.assignee_label ?? undefined,
      leadId: row.lead_id,
      leadLabel: row.lead_label || "Lead",
      leadDoNotContact: row.lead_do_not_contact,
    }));
}

// Returns false when a delivery for this person and day already exists
// (another run claimed it first), so nobody is emailed twice.
export async function claimSupabaseTaskDigestDelivery(
  client: SupabaseClient,
  input: { profileId: string; digestDate: string; taskCount: number },
) {
  const { data, error } = await client.from("task_digest_deliveries")
    .upsert(
      { profile_id: input.profileId, digest_date: input.digestDate, task_count: input.taskCount, status: "sending" },
      { onConflict: "profile_id,digest_date", ignoreDuplicates: true },
    )
    .select("id");
  fail("Unable to record task digest delivery", error);
  const rows = (data ?? []) as { id: string }[];
  return rows[0]?.id ?? null;
}

export async function completeSupabaseTaskDigestDelivery(
  client: SupabaseClient,
  deliveryId: string,
  outcome: { status: "sent" | "failed"; providerMessageId?: string; error?: string },
) {
  const { error } = await client.from("task_digest_deliveries")
    .update({
      status: outcome.status,
      provider_message_id: outcome.providerMessageId ?? null,
      error: outcome.error?.slice(0, 500) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
  fail("Unable to update task digest delivery", error);
}

export async function fetchOwnTaskDigestPreference(client: SupabaseClient, profileId: string) {
  const { data, error } = await client.from("profiles")
    .select("task_digest_enabled")
    .eq("id", profileId)
    .maybeSingle();
  fail("Unable to load digest preference", error);
  return (data as { task_digest_enabled?: boolean } | null)?.task_digest_enabled ?? true;
}

export async function setOwnTaskDigestPreference(client: SupabaseClient, enabled: boolean) {
  const { error } = await client.rpc("set_own_task_digest_preference", { p_enabled: enabled });
  fail("Unable to update digest preference", error);
  return enabled;
}
