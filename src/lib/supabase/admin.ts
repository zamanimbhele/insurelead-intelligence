import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "./config.ts";

export function createSupabaseAdminClient() {
  const config = getSupabaseAdminConfig();
  if (!config) return null;

  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}


// Broker team invitations (invite_broker_team_member() RPC in
// 202610110002_broker_team_invitations.sql) need a real Supabase auth
// user to exist before that RPC can attach a profile to it - creating
// one, and sending Supabase's own invite email, requires the GoTrue
// Admin API, which only works with the service-role key. This is the
// only place in the codebase that calls auth.admin.* - every other
// mutation uses the caller's own session client plus a SECURITY DEFINER
// RPC, but there is no RPC equivalent for creating an auth.users row
// itself. Deliberately does NOT set raw_user_meta_data.brokerage_name:
// handle_new_user() only auto-provisions a new organisation when that
// field is present (self-service signup), so an admin-invited user is
// correctly left alone by that trigger and only gets a profile once
// invite_broker_team_member() runs.
export async function inviteSupabaseAuthUser(email: string, fullName?: string) {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase mode requires a project URL, publishable key, and server-only secret key");
  }
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (error || !data?.user?.id) {
    throw new Error(error?.message || "Unable to send the invitation");
  }
  return data.user.id;
}
