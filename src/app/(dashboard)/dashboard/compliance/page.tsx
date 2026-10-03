import { redirect } from "next/navigation";
import { canManageCompliance, canViewCompliance, getDashboardIdentity } from "@/lib/auth";
import { getComplianceOverview } from "@/lib/dashboard-data";
import { ComplianceDashboard } from "@/components/dashboard/ComplianceDashboard";

export const metadata = { title: "Compliance | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const identity = await getDashboardIdentity();
  if (!canViewCompliance(identity)) redirect("/access-denied");

  const overview = await getComplianceOverview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          {overview.dataMode === "demo" ? "Synthetic demo data. " : null}
          A single view of consent coverage, outreach restrictions, routing gaps, and data-retention exposure across
          every lead this role can see.
        </p>
      </div>
      <ComplianceDashboard overview={overview} canManage={canManageCompliance(identity)} />
    </div>
  );
}
