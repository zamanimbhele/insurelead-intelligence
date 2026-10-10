import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./supabase/server";
import { getDataMode } from "./supabase/config";
import { DEFAULT_DEMO_ROLE, DEMO_ROLE_ACCOUNTS, DEMO_ROLE_COOKIE_NAME } from "./constants";

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

// The 6 DEMO_ROLE_ACCOUNTS roles (constants.ts) are already a subset of
// ADMIN_ROLES | AUDIT_ROLES | BROKER_ROLES, so no separate demo-only role
// literal is needed here - a demo identity's role is always one of these
// same real role strings now, never a "demo_"-prefixed one.
export type DashboardRole =
  | (typeof ADMIN_ROLES)[number]
  | (typeof AUDIT_ROLES)[number]
  | (typeof BROKER_ROLES)[number]
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
    // No real sign-in exists in demo mode, so the "signed-in user" is
    // whichever of the 6 seeded DEMO_ROLE_ACCOUNTS (constants.ts) the
    // demo_role cookie names - set by the role switcher in the dashboard
    // sidebar (see DemoRoleSwitcher.tsx / actions.ts's setDemoRole()).
    // Falls back to the first account (Super Admin / platform_admin) for
    // an unset or invalid cookie, so every pre-existing e2e test that
    // never selects a role keeps seeing full admin access unchanged.
    const cookieStore = await cookies();
    const requestedRole = cookieStore.get(DEMO_ROLE_COOKIE_NAME)?.value;
    const account =
      DEMO_ROLE_ACCOUNTS.find((candidate) => candidate.role === requestedRole) ??
      DEMO_ROLE_ACCOUNTS.find((candidate) => candidate.role === DEFAULT_DEMO_ROLE)!;
    return {
      mode: "demo",
      authenticated: true,
      accessAllowed: true,
      displayName: account.displayName,
      email: account.email,
      role: account.role,
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

// Previously also true for every demo identity unconditionally
// (`identity.mode === "demo" || ...`), which meant the demo role
// switcher above could never actually restrict anything - every demo
// account looked like a platform admin regardless of which one was
// selected. Now demo mode goes through the same role check as Supabase
// mode; it still reads as "always admin" for the default demo account
// because DEFAULT_DEMO_ROLE is "platform_admin" (a real ADMIN_ROLES
// member), which is what keeps every pre-existing e2e test passing
// without changes.
export function isPlatformAdmin(identity: DashboardIdentity) {
  return ADMIN_ROLES.includes(identity.role as (typeof ADMIN_ROLES)[number]);
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

// Adding a broker sending identity (an email-sending domain/from-address
// used for campaign delivery) is a broker self-service action, not a
// platform one - deliberately excludes isPlatformAdmin(), unlike every
// other canManage*() helper above. The create_broker_sending_identity()
// RPC always infers the new identity's organisation from the caller's
// own active profile (never a client-supplied organisation id), so a
// platform admin - who belongs to the platform organisation, not a
// broker one - has no organisation of their own to attach an identity
// to; platform admins keep their existing, separate review action
// (verify/disable) via reviewSupabaseSendingIdentity() instead. Reuses
// CAMPAIGN_PLANNING_ROLES (broker_admin, campaign_manager) since those
// are exactly the roles that also create and launch the campaigns a
// sending identity is for; an ordinary broker_agent does not manage
// sending domains, same exclusion CAMPAIGN_PLANNING_ROLES already
// documents above.
export function canCreateSendingIdentity(identity: DashboardIdentity) {
  return CAMPAIGN_PLANNING_ROLES.includes(identity.role as (typeof CAMPAIGN_PLANNING_ROLES)[number]);
}
