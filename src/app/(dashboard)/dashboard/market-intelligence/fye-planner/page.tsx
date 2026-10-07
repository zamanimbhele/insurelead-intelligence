import { Info } from "lucide-react";
import { canManageCampaignPlanning, canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { getFyePlannerData } from "@/lib/dashboard-data";
import { FyeCampaignPlanner } from "@/components/dashboard/FyeCampaignPlanner";

export const metadata = { title: "Financial Year-End Campaign Planner | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function FyePlannerPage() {
  const identity = await getDashboardIdentity();
  const { calendar, plans, breakdowns } = await getFyePlannerData();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Financial Year-End Campaign Planner</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Not every business shares the same financial year-end, so this planner groups already-captured leads by
          each business&apos;s own financial-year-end month rather than assuming a single national cycle (such as
          March).
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          A plan here is a reminder and calendar entry only - it never sends anything itself. Creating follow-up
          tasks only ever creates ordinary broker tasks for a human to act on, the same as adding one by hand from a
          lead&apos;s profile.
        </span>
      </div>

      <FyeCampaignPlanner
        calendar={calendar}
        plans={plans}
        breakdowns={breakdowns}
        canManagePlans={canManageCampaignPlanning(identity)}
        canCreateTasks={canUpdateLeadStatus(identity)}
      />
    </div>
  );
}
