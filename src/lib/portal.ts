// Which portal a role belongs to. Platform staff (Indlela's own admins and
// compliance people) work across every broker; broker roles work inside one
// brokerage. The two get different sign-in pages, landing pages and looks
// so nobody acts in the all-broker view without realising it. Both use the
// same Supabase accounts and the same server-side permission checks.
export const PLATFORM_STAFF_ROLES = ["platform_admin", "compliance_admin", "compliance_auditor"] as const;

export const ADMIN_HOME = "/dashboard/admin";
export const BROKER_HOME = "/dashboard";

export function isPlatformStaffRole(role: string | null | undefined): boolean {
  return (PLATFORM_STAFF_ROLES as readonly string[]).includes(role ?? "");
}

export function homeForRole(role: string | null | undefined): string {
  return isPlatformStaffRole(role) ? ADMIN_HOME : BROKER_HOME;
}

// The band shown on every page of the admin portal.
export function portalBadge(role: string | null | undefined): { label: string; note: string } | null {
  if (role === "compliance_auditor") {
    return { label: "Compliance auditor", note: "Read-only access across every broker" };
  }
  if (role === "compliance_admin") {
    return { label: "Compliance admin", note: "Changes here affect every broker" };
  }
  if (role === "platform_admin") {
    return { label: "Platform admin", note: "Changes here affect every broker" };
  }
  return null;
}

// Only same-site dashboard paths may be used as a post-sign-in destination.
export function safeDashboardPath(value: unknown): string | null {
  const path = typeof value === "string" ? value.trim() : "";
  return path.startsWith("/dashboard") && !path.startsWith("//") ? path : null;
}
