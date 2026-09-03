import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "./config.ts";

export function createSupabaseAdminClient() {
  const config = getSupabaseAdminConfig();
  if (!config) return null;

  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
