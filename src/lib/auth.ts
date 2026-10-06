import { createSupabaseServerClient } from "./supabase/server";
import { getDataMode } from "./supabase/config";

export const ADMIN_ROLES = ["platform_admin", "compliance_admin"] as const;
export const AUDIT_ROLES = ["compliance_auditor"] as const;
export const BROKER_ROLES = ["broker_admin", "campaign_manager", "broker_agent"] as const;
export const BROKER_OPERATOR_ROLES = ["broker_admin", "broker_agent"] as const;
// Who may create/manage a Financial-Year-End Campaign Planner entry -
// mirrors the role set src/mcp/campaign-tools.ts already uses for its
// own assertCanCreate() (platform_admin, broker_admin, campaign_manager),
// matching the project brief's "Broker Manager: create campaigns" /
// "Marketing Analyst: create campaign records". Deliberately excludes
// broker_agent (an ordinary Broker only ever works assigned leads).
export const CAMPAIGN_PLANNING_ROLES = ["broker_admin", "campaign_manager"] as const;

export type DashboardRole =
  | (typeof ADMIN_ROLES)[number]
  | (typeof AUDIT_ROLES)[number]
  | (typeof BROKER_ROLES)[number]
  | "demo_platform_admin"
  | "anonymous"
  | "unassigned"
  | "unconfigured";

export type DashboardIdentity = {
  mode: "demo" | "supabase";
  authenticated: boolean;
  accessAllowed: boolean;
  userId?: string;
  email?: string;
  displayName?: string;
  role: DashboardRole | string;
  organisationId?: string;
  organisationType?: "platform" | "broker" | "insurer";
  organisationName: string;
  reason?: "configuration" | "profile_missing" | "profile_suspended" | "organisation_inactive";
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
    .select("role, organisation_id, display_name, member_status")
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

  if (profile.member_status !== "active") {
    return {
      mode: "supabase",
      authenticated: true,
      accessAllowed: false,
      userId: user.id,
      email: user.email,
      displayName: profile.display_name ?? undefined,
      role: profile.role,
      organisationId: profile.organisation_id,
      organisationName: "Membership suspended",
      reason: "profile_suspended",
    };
  }

  const { data: organisation } = await supabase
    .from("organisations")
    .select("name, status, organisation_type")
    .eq("id", profile.organisation_id)
    .maybeSingle();

  if (!organisation || organisation.status !== "active") {
    return {
      mode: "supabase",
      authenticated: true,
      accessAllowed: false,
      userId: user.id,
      email: user.email,
      displayName: profile.display_name ?? undefined,
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
    displayName: profile.display_name ?? undefined,
    role: profile.role,
    organisationId: profile.organisation_id,
    organisationType: organisation.organisation_type,
    organisationName: organisation.name,
  };
}

export function isPlatformAdmin(identity: DashboardIdentity) {
  return identity.mode === "demo" || ADMIN_ROLES.includes(identity.role as (typeof ADMIN_ROLES)[number]);
}

export function isComplianceAuditor(identity: DashboardIdentity) {
  return AUDIT_ROLES.includes(identity.role as (typeof AUDIT_ROLES)[number]);
}

export function isBrokerUser(identity: DashboardIdentity) {
  return BROKER_ROLES.includes(identity.role as (typeof BROKER_ROLES)[number]);
}

export function canRespondToAllocations(identity: DashboardIdentity) {
  return BROKER_OPERATOR_ROLES.includes(identity.role as (typeof BROKER_OPERATOR_ROLES)[number]);
}

// Platform admins manage the whole pipeline; a broker operator (admin or
// agent - not campaign_manager, which is marketing-facing) may move only
// the leads allocated and accepted by their own organisation. The
// update_lead_status() database function re-checks this server-side for
// Supabase mode, so this is a UX gate, not the authority boundary.
export function canUpdateLeadStatus(identity: DashboardIdentity) {
  return isPlatformAdmin(identity) || BROKER_OPERATOR_ROLES.includes(identity.role as (typeof BROKER_OPERATOR_ROLES)[number]);
}

// Compliance dashboard: platform admins, compliance admins (both covered by
// isPlatformAdmin - see ADMIN_ROLES) and compliance auditors may all view
// it; only the admin roles may change the configurable retention
// threshold. Mirrors the Supabase is_platform_admin()/is_compliance_auditor()
// RLS helpers so the UI gate and the database's actual enforcement agree.
export function canViewCompliance(identity: DashboardIdentity) {
  return isPlatformAdmin(identity) || isComplianceAuditor(identity);
}

export function canManageCompliance(identity: DashboardIdentity) {
  return isPlatformAdmin(identity);
}

// FYE Campaign Planner plan/reminder records. Viewing the planner itself
// is open to anyone who reaches Market Intelligence (same as the hotspot
// and industry dashboards - no page-level gate), this only guards the
// mutating actions: creating or re-statusing a plan.
export function canManageCampaignPlanning(identity: DashboardIdentity) {
  return isPlatformAdmin(identity) || CAMPAIGN_PLANNING_ROLES.includes(identity.role as (typeof CAMPAIGN_PLANNING_ROLES)[number]);
}
