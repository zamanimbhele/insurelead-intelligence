import { getDashboardLeads } from "@/lib/dashboard-data";
import { getDataMode } from "@/lib/supabase/config";
import { LeadsTable } from "@/components/dashboard/LeadsTable";

export const metadata = { title: "Leads | InsureLead Intelligence" };

export default async function LeadsPage() {
  const leads = await getDashboardLeads();
  const demoMode = getDataMode() === "demo";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          {leads.length} {demoMode ? "synthetic demo" : "accessible"} leads.
          {!demoMode && " Row Level Security limits this list to records available to your organisation and role."}
        </p>
      </div>
      <LeadsTable leads={leads} />
    </div>
  );
}
