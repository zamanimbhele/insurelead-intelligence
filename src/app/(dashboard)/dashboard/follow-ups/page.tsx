import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock, ListTodo } from "lucide-react";
import { canUpdateLeadStatus, getDashboardIdentity, isBrokerUser, isPlatformAdmin } from "@/lib/auth";
import { getDashboardFollowUps } from "@/lib/dashboard-data";
import { getDataMode } from "@/lib/supabase/config";
import { formatDueSast } from "@/lib/task-digest";
import { FollowUpQueue } from "@/components/dashboard/FollowUpQueue";
import { StatCard } from "@/components/dashboard/StatCard";

export const metadata = { title: "Follow-ups | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90] as const;

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: requestedDays } = await searchParams;
  // Only the listed periods are accepted; anything else falls back to 7.
  const days = PERIODS.find((period) => String(period) === requestedDays) ?? 7;

  const identity = await getDashboardIdentity();
  const { queue, team } = await getDashboardFollowUps(days);
  const demoMode = getDataMode() === "demo";

  // The person who runs the practice sees what each team member recorded.
  // Everyone else sees the queue only. This is a display choice: the
  // database already limits both to the organisation's own leads.
  const showTeam = isPlatformAdmin(identity) || identity.role === "broker_admin";

  const count = (bucket: string) => queue.filter((item) => item.bucket === bucket).length;
  const formattedDue = Object.fromEntries(
    queue.filter((item) => item.dueAt).map((item) => [item.taskId, formatDueSast(item.dueAt as string)]),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Follow-ups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every open follow-up across {demoMode ? "the synthetic demo leads" : isBrokerUser(identity) ? "your organisation's leads" : "the leads you can access"},
          soonest first. Times are South African time.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard testId="stat-follow-ups-overdue" label="Overdue" value={count("overdue")} icon={AlertTriangle} accent="red" />
        <StatCard testId="stat-follow-ups-today" label="Due today" value={count("today")} icon={Clock} accent="amber" />
        <StatCard testId="stat-follow-ups-week" label="Next 7 days" value={count("next_7_days")} icon={CalendarClock} />
        <StatCard testId="stat-follow-ups-open" label="All open" value={queue.length} icon={ListTodo} accent="slate" />
      </div>

      <FollowUpQueue items={queue} formattedDue={formattedDue} canEdit={canUpdateLeadStatus(identity)} />

      {showTeam && (
        <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="team-activity">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Team activity, last {days} days</h2>
              <p className="mt-1 text-xs text-slate-500">
                What each person recorded on leads, and the follow-ups assigned to them now.
              </p>
            </div>
            <nav aria-label="Activity period" className="flex gap-1 text-sm">
              {PERIODS.map((period) => (
                <Link
                  key={period}
                  href={`/dashboard/follow-ups?days=${period}`}
                  aria-current={period === days ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 font-medium ${period === days ? "bg-primary-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {period} days
                </Link>
              ))}
            </nav>
          </div>

          {team.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Nothing was recorded in this period and no follow-ups are open.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="py-2 pr-3 font-medium">Person</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Contacts logged</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Reached</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Notes</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Follow-ups done</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Stage changes</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Open now</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Overdue</th>
                    <th scope="col" className="py-2 font-medium">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {team.map((row) => (
                    <tr key={row.person}>
                      <th scope="row" className="py-2 pr-3 font-medium text-slate-900">{row.person}</th>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.contactsLogged}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.connected}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.notes}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.followUpsCompleted}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.stageChanges}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.openFollowUps}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${row.overdueFollowUps > 0 ? "font-semibold text-red-700" : "text-slate-700"}`}>
                        {row.overdueFollowUps}
                      </td>
                      <td className="py-2 text-slate-500">{row.lastActiveAt ? formatDueSast(row.lastActiveAt) : "No activity"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
