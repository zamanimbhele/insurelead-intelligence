export type InsureLeadDataMode = "demo" | "supabase";

export function getDataMode(): InsureLeadDataMode {
  const configuredMode = process.env.INSURELEAD_DATA_MODE;
  if (!configuredMode || configuredMode === "demo") return "demo";
  if (configuredMode === "supabase") return "supabase";
  throw new Error("INSURELEAD_DATA_MODE must be either 'demo' or 'supabase'");
}

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function getSupabaseAdminConfig() {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return publicConfig && serviceRoleKey
    ? { url: publicConfig.url, serviceRoleKey }
    : null;
}

export function isSupabaseMode() {
  return getDataMode() === "supabase";
}
