import { describe, expect, it } from "vitest";
import { homeForRole, isPlatformStaffRole, portalBadge, safeDashboardPath } from "./portal";

describe("portal routing", () => {
  it("sends platform staff to the admin home and brokers to the broker dashboard", () => {
    for (const role of ["platform_admin", "compliance_admin", "compliance_auditor"]) {
      expect(isPlatformStaffRole(role)).toBe(true);
      expect(homeForRole(role)).toBe("/dashboard/admin");
    }
    for (const role of ["broker_admin", "broker_agent", "campaign_manager", "unassigned", undefined, null]) {
      expect(isPlatformStaffRole(role)).toBe(false);
      expect(homeForRole(role)).toBe("/dashboard");
    }
  });

  it("labels each staff role and marks auditors read-only", () => {
    expect(portalBadge("platform_admin")?.label).toBe("Platform admin");
    expect(portalBadge("compliance_auditor")?.note).toMatch(/Read-only/);
    expect(portalBadge("broker_admin")).toBeNull();
  });

  it("accepts only same-site dashboard paths as a destination", () => {
    expect(safeDashboardPath("/dashboard/brokers")).toBe("/dashboard/brokers");
    expect(safeDashboardPath("//evil.example/dashboard")).toBeNull();
    expect(safeDashboardPath("https://evil.example")).toBeNull();
    expect(safeDashboardPath("")).toBeNull();
    expect(safeDashboardPath(undefined)).toBeNull();
  });
});
