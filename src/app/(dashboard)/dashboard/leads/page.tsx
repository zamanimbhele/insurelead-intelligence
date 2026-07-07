import { getLeads } from "@/lib/demo-store";
import { LeadsTable } from "@/components/dashboard/LeadsTable";

export const metadata = { title: "Leads | InsureLead Intelligence" };

export default function LeadsPage() {
  const leads = getLeads();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          {leads.length} synthetic demo leads. In production this view is scoped by Row Level Security to each
          broker&apos;s assigned leads, or a manager&apos;s full team.
        </p>
      </div>
      <LeadsTable leads={leads} />
    </div>
  );
}
