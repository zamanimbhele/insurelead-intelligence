import { getDashboardLeads } from "@/lib/dashboard-data";
import { getDataMode } from "@/lib/supabase/config";
import { StatCard } from "@/components/dashboard/StatCard";
import { LeadsTable } from "@/components/dashboard/LeadsTable";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { Users, Clock, AlertTriangle, TrendingUp, ShieldOff } from "lucide-react";
import { isToday, isThisWeek } from "date-fns";

export const metadata = { title: "Dashboard | InsureLead Intelligence" };

export default async function DashboardPage() {
  const leads = await getDashboardLeads();

  const newToday = leads.filter((l) => isToday(new Date(l.createdAt))).length;
  const newThisWeek = leads.filter((l) => isThisWeek(new Date(l.createdAt), { weekStartsOn: 1 })).length;
  const needsFollowUp = leads.filter((l) => ["new", "contact_attempted"].includes(l.status) && !l.doNotContact).length;
  const dncCount = leads.filter((l) => l.doNotContact).length;
  const unassigned = leads.filter((l) => !l.assignedBroker).length;
  const won = leads.filter((l) => l.status === "won").length;
  const conversionRate = leads.length ? Math.round((won / leads.length) * 100) : 0;

  const byStatus = Object.entries(LEAD_STATUS_LABELS).map(([status, label]) => ({
    status,
    label,
    count: leads.filter((l) => l.status === status).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Lead Management Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          {getDataMode() === "demo" ? "Synthetic demo data" : "Live, access-controlled lead data"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard testId="stat-new-today" label="New Today" value={newToday} icon={Users} />
        <StatCard testId="stat-new-this-week" label="New This Week" value={newThisWeek} icon={TrendingUp} />
        <StatCard testId="stat-needs-follow-up" label="Needs Follow-Up" value={needsFollowUp} icon={Clock} accent="amber" />
        <StatCard testId="stat-unassigned" label="Unassigned" value={unassigned} icon={AlertTriangle} accent="red" />
        <StatCard testId="stat-do-not-contact" label="Do Not Contact" value={dncCount} icon={ShieldOff} accent="slate" />
        <StatCard testId="stat-win-rate" label="Win Rate" value={`${conversionRate}%`} icon={TrendingUp} accent="primary" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Leads by Status</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {byStatus.map((s) => (
            <div key={s.status} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-900">{s.count}</span>
              <span className="text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent Leads</h2>
        <LeadsTable leads={leads} />
      </div>
    </div>
  );
}
