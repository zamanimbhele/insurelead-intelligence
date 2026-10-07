import { Info } from "lucide-react";
import { canManageCompliance, canViewCompliance, getDashboardIdentity } from "@/lib/auth";
import { getDashboardAuditLog } from "@/lib/dashboard-data";
import { AuditLogViewer } from "@/components/dashboard/AuditLogViewer";
import { redirect } from "next/navigation";

export const metadata = { title: "Audit Log | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const identity = await getDashboardIdentity();
  if (!canViewCompliance(identity)) redirect("/dashboard");

  const entries = await getDashboardAuditLog();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Every lead, consent, assignment, status, task, campaign plan, data source, and settings change this
          platform has recorded - nothing here can be deleted or edited, by any role, from this page or any other.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          Showing the most recent 500 entries. Narrow with a filter below to find something further back, or export
          the filtered view - every export is itself logged here.
        </span>
      </div>

      <AuditLogViewer entries={entries} canExport={canManageCompliance(identity)} />
    </div>
  );
}
