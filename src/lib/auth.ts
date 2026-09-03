import { createSupabaseServerClient } from "./supabase/server";
import { getDataMode } from "./supabase/config";

export const ADMIN_ROLES = ["platform_admin", "compliance_admin"] as const;

export type DashboardIdentity = {
  mode: "demo" | "supabase";
  authenticated: boolean;
  accessAllowed: boolean;
  userId?: string;
  email?: string;
  role: string;
  organisationId?: string;
  organisationName: string;
  reason?: "configuration" | "profile_missing" | "organisation_inactive";
};

export async function getDashboardIdentity(): Promise<DashboardIdentity> {
  if (getDataMode() === "demo") {
    return {
      mode: "demo",
      authenticated: true,
      accessAllowed: true,
      role: "demo_platform_admin",
      organisationName: "Synthetic demo workspace",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      mode: "supabase",
      authenticated: false,
      accessAllowed: false,
      role: "unconfigured",
      organisationName: "Not configured",
      reason: "configuration",
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return {
      mode: "supabase",
      authenticated: false,
      accessAllowed: false,
      role: "anonymous",
      organisationName: "Unknown",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organisation_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      mode: "supabase",
      authenticated: true,
      accessAllowed: false,
      userId: user.id,
      email: user.email,
      role: "unassigned",
      organisationName: "No organisation assigned",
      reason: "profile_missing",
    };
  }

  if (!profile.organisation_id) {
    return {
      mode: "supabase",
      authenticated: true,
      accessAllowed: false,
      userId: user.id,
      email: user.email,
      role: profile.role,
      organisationName: "No organisation assigned",
      reason: "profile_missing",
    };
  }

  const { data: organisation } = await supabase
    .from("organisations")
    .select("name, status")
    .eq("id", profile.organisation_id)
    .maybeSingle();

  if (!organisation || organisation.status !== "active") {
    return {
      mode: "supabase",
      authenticated: true,
      accessAllowed: false,
      userId: user.id,
      email: user.email,
      role: profile.role,
      organisationId: profile.organisation_id,
      organisationName: organisation?.name ?? "Unknown organisation",
      reason: "organisation_inactive",
    };
  }

  return {
    mode: "supabase",
    authenticated: true,
    accessAllowed: true,
    userId: user.id,
    email: user.email,
    role: profile.role,
    organisationId: profile.organisation_id,
    organisationName: organisation.name,
  };
}

export function isPlatformAdmin(identity: DashboardIdentity) {
  return identity.mode === "demo" || ADMIN_ROLES.includes(identity.role as (typeof ADMIN_ROLES)[number]);
}
