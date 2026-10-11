import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { canApproveCampaigns, canManageCampaigns, getDashboardIdentity } from "@/lib/auth";
import { getDashboardCampaignDetail } from "@/lib/dashboard-data";
import { INSURANCE_PRODUCTS } from "@/lib/constants";
import { CampaignContentForm } from "@/components/dashboard/CampaignContentForm";
import { CampaignApprovalForm } from "@/components/dashboard/CampaignApprovalForm";

export const dynamic = "force-dynamic";

const productLabels = new Map(INSURANCE_PRODUCTS.map((product) => [product.value, product.label]));

const statusStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_review: "bg-amber-50 text-amber-700",
  approved: "bg-blue-50 text-blue-700",
  scheduled: "bg-violet-50 text-violet-700",
  sending: "bg-cyan-50 text-cyan-700",
  paused: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

// Visual authoring and approval for a single campaign - the detail page
// behind the "New campaign draft" entry point on /dashboard/campaigns.
// Every validation issue shown below comes from the exact same
// validateCampaign() function (campaign-policy.ts) the Campaign
// Orchestration MCP tools and the database's own RLS/RPC checks already
// enforce (see getDashboardCampaignDetail() in dashboard-data.ts), so
// this page can explain *why* a campaign cannot be approved or launched
// without duplicating or drifting from that logic.
export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await getDashboardIdentity();
  const detail = await getDashboardCampaignDetail(identity, id);
  if (!detail) return notFound();

  const { campaign, buyer, sendingIdentity, content, audience, issues, recipients, events } = detail;
  const canAuthor = canManageCampaigns(identity) && !["sending", "completed", "cancelled"].includes(campaign.status);
  const canApprove = canApproveCampaigns(identity) && ["draft", "pending_review"].includes(campaign.status);
  const errors = issues.filter((issue) => issue.severity === "error");
  const exclusionReasons = Object.entries(audience.exclusionReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/campaigns" className="flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-primary-700">
        <ArrowLeft className="h-4 w-4" /> Back to campaigns
      </Link>

      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[campaign.status] ?? statusStyles.draft}`}>
              {campaign.status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm capitalize text-slate-500">
            {buyer?.organisationName ?? "Broker tenant"} &middot; {campaign.objective.replaceAll("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {campaign.insuranceProducts.map((product) => (
            <span key={product} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              {productLabels.get(product) ?? product}
            </span>
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="campaign-validation">
        <h2 className="text-sm font-semibold text-slate-900">Validation</h2>
        <p className="mt-1 text-xs text-slate-400">
          The same checks the Campaign Orchestration MCP tools and the database&apos;s own policies enforce before approval or delivery.
        </p>
        {issues.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> No validation issues.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {issues.map((issue) => (
              <li
                key={issue.code}
                className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
                  issue.severity === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Current content</h2>
            {content ? (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                <p className="text-xs text-slate-400">Version {content.version} &middot; generated by {content.generatedBy}</p>
                <div>
                  <p className="text-xs text-slate-400">Subject</p>
                  <p className="mt-0.5 font-medium text-slate-800">{content.subject}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Preheader</p>
                  <p className="mt-0.5 text-slate-700">{content.preheader}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Plain-text preview</p>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{content.textBody}</pre>
                </div>
                <details className="rounded-md border border-slate-200 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500">HTML source</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{content.htmlBody}</pre>
                </details>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No content has been generated for this campaign yet.</p>
            )}
          </section>

          {canAuthor && <CampaignContentForm campaignId={campaign.id} />}

          {canApprove && (
            <CampaignApprovalForm campaignId={campaign.id} blocked={errors.length > 0} blockedReason={errors[0]?.message} />
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No activity recorded yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-xs text-slate-600">
                {events.slice(0, 15).map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <span className="capitalize">{event.eventType.replaceAll("_", " ")} &middot; {event.actor}</span>
                    <span className="text-slate-400">{format(new Date(event.occurredAt), "d MMM yyyy, HH:mm")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Audience</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-400">Eligible</dt><dd className="mt-0.5 font-semibold text-emerald-700">{audience.eligible}</dd></div>
              <div><dt className="text-xs text-slate-400">Excluded</dt><dd className="mt-0.5 font-semibold text-slate-700">{audience.excluded}</dd></div>
              <div><dt className="text-xs text-slate-400">Recipients prepared</dt><dd className="mt-0.5 text-slate-700">{recipients.length}</dd></div>
              <div><dt className="text-xs text-slate-400">Basis</dt><dd className="mt-0.5 text-slate-700">Marketing consent</dd></div>
            </dl>
            {exclusionReasons.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-500">Top exclusion reasons</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-xs text-slate-600">
                  {exclusionReasons.map(([reason, count]) => (
                    <li key={reason} className="flex items-center justify-between gap-2">
                      <span>{reason}</span>
                      <span className="font-medium text-slate-800">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900">Sending identity</h2>
            {sendingIdentity ? (
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div><dt className="text-xs text-slate-400">From</dt><dd className="mt-0.5 text-slate-700">{sendingIdentity.fromName} &lt;{sendingIdentity.fromEmail}&gt;</dd></div>
                <div><dt className="text-xs text-slate-400">Status</dt><dd className="mt-0.5 capitalize text-slate-700">{sendingIdentity.status}</dd></div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No sending identity is attached.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
