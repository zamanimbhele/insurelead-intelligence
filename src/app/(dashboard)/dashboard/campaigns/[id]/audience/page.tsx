import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { getDashboardCampaignDetail } from "@/lib/dashboard-data";
import { buildAudienceBreakdown } from "@/lib/campaign-transparency";

export const dynamic = "force-dynamic";

// "Who is in, who is out, and why" for one campaign: the same
// evaluateCampaignAudience() decisions the validation panel, the MCP
// tools and send-time checks use, listed lead by lead. Names and links
// show only for roles that work leads; analysts and auditors see an
// anonymised reference with the same reasons.
export default async function CampaignAudiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { id } = await params;
  const { reason } = await searchParams;
  const identity = await getDashboardIdentity();
  const detail = await getDashboardCampaignDetail(identity, id);
  if (!detail) return notFound();

  const breakdown = buildAudienceBreakdown({
    decisions: detail.audienceDecisions,
    leads: detail.leads,
    recipients: detail.recipients,
    showIdentity: canUpdateLeadStatus(identity),
    reasonFilter: reason,
  });
  const base = `/dashboard/campaigns/${detail.campaign.id}/audience`;
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-primary-600 bg-primary-600 text-white" : "border-slate-200 text-slate-700 hover:border-primary-300"}`;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/dashboard/campaigns/${detail.campaign.id}`} className="flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-primary-700">
        <ArrowLeft className="h-4 w-4" /> Back to {detail.campaign.name}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audience breakdown</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every lead in this broker&apos;s book, whether it qualifies for the campaign, and why not.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="campaign-audience-summary">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-400">Eligible</dt><dd className="mt-0.5 text-xl font-semibold text-emerald-700">{breakdown.eligibleCount}</dd></div>
          <div><dt className="text-xs text-slate-400">Excluded</dt><dd className="mt-0.5 text-xl font-semibold text-slate-800">{breakdown.excludedCount}</dd></div>
          <div><dt className="text-xs text-slate-400">Removed at send time</dt><dd className="mt-0.5 text-xl font-semibold text-slate-800">{breakdown.removedAtSend.length}</dd></div>
        </dl>
        {breakdown.notAllocatedCount > 0 && (
          <p className="mt-3 text-xs text-slate-400" data-testid="campaign-audience-not-allocated">
            {breakdown.notAllocatedCount} other lead{breakdown.notAllocatedCount === 1 ? " is" : "s are"} not accepted by this broker, so {breakdown.notAllocatedCount === 1 ? "it is" : "they are"} not listed.
          </p>
        )}
        <nav aria-label="Filter by reason" className="mt-4 flex flex-wrap gap-2">
          <Link href={base} className={chip(!reason)}>All</Link>
          <Link href={`${base}?reason=eligible`} className={chip(reason === "eligible")}>Eligible ({breakdown.eligibleCount})</Link>
          {breakdown.reasons.map((item) => (
            <Link key={item.reason} href={`${base}?reason=${encodeURIComponent(item.reason)}`} className={chip(reason === item.reason)}>
              {item.reason} ({item.count})
            </Link>
          ))}
        </nav>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="campaign-audience-table">
        {breakdown.rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">No leads match this filter.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-6 py-3 font-medium">Lead</th><th className="px-6 py-3 font-medium">Status</th><th className="px-6 py-3 font-medium">Reasons</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {breakdown.rows.map((row) => (
                <tr key={row.leadId}>
                  <td className="px-6 py-3 font-medium text-slate-800">
                    {row.linkable ? <Link href={`/dashboard/leads/${row.leadId}`} className="text-primary-700 hover:text-primary-800">{row.label}</Link> : row.label}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.eligible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {row.eligible ? "Eligible" : "Excluded"}
                    </span>
                    {row.recipientStatus && <span className="ml-2 text-xs capitalize text-slate-400">{row.recipientStatus}</span>}
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-600">{row.reasons.join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {breakdown.removedAtSend.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="campaign-audience-removed">
          <h2 className="text-sm font-semibold text-slate-900">Removed at send time</h2>
          <p className="mt-1 text-xs text-slate-400">Prepared as recipients, then skipped when the send-time check ran.</p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {breakdown.removedAtSend.map((row) => (
              <li key={row.leadId} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-slate-800">{row.label}</span>
                <span className="text-xs text-slate-500">{row.sendTimeReason ?? row.recipientStatus}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
