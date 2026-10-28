// A signed-in user's own role. Read with their session first; when the
// database refuses that (a platform staff session that has not yet
// completed multi-factor authentication cannot use the Data API), read
// it with the server key instead. Only ever reads the row of the user id
// Supabase has just verified for this session.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase/admin.ts";

export async function readRoleWithServerKey(userId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

export async function readOwnRole(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!error && data) return (data as { role?: string }).role ?? null;
  return readRoleWithServerKey(userId);
}

export async function currentAssuranceLevel(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel ?? null;
}
