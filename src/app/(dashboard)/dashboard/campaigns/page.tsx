import { format } from "date-fns";

import { getDashboardIdentity } from "@/lib/auth";
import { INSURANCE_PRODUCTS } from "@/lib/constants";
import { getDashboardCampaignData } from "@/lib/dashboard-data";

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

export default async function CampaignsPage() {
  const identity = await getDashboardIdentity();
  const { campaigns, buyers, recipients } = await getDashboardCampaignData(identity);
  const buyersById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
  const active = campaigns.filter((campaign) => ["approved", "scheduled", "sending"].includes(campaign.status)).length;
  const awaitingApproval = campaigns.filter((campaign) => campaign.status === "pending_review").length;
  const sent = [...recipients.values()].flat().filter((recipient) => ["sent", "delivered"].includes(recipient.status)).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Campaign Orchestration</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Versioned, product-specific campaigns for approved broker tenants. Generation, approval, and delivery remain separate audited actions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Campaigns" value={campaigns.length} />
        <Metric label="Awaiting approval" value={awaitingApproval} />
        <Metric label="Sent recipients" value={sent} />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Campaign workspace</h2>
            <p className="mt-1 text-xs text-slate-400">Use the MCP tools to draft, validate, preview, approve, and explicitly launch.</p>
          </div>
          <span className="text-xs font-medium text-slate-500">{active} active</span>
        </div>

        {campaigns.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">No campaigns are visible in this tenant.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {campaigns.map((campaign) => {
              const buyer = buyersById.get(campaign.organisationId);
              const campaignRecipients = recipients.get(campaign.id) ?? [];
              return (
                <article key={campaign.id} data-testid="campaign-card" className="grid gap-5 px-6 py-5 lg:grid-cols-[1.5fr_1fr_0.8fr] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[campaign.status] ?? statusStyles.draft}`}>
                        {campaign.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{buyer?.organisationName ?? "Broker tenant"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {campaign.insuranceProducts.map((product) => (
                        <span key={product} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                          {productLabels.get(product) ?? product}
                        </span>
                      ))}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-xs text-slate-400">Objective</dt><dd className="mt-1 capitalize text-slate-700">{campaign.objective.replaceAll("_", " ")}</dd></div>
                    <div><dt className="text-xs text-slate-400">Content</dt><dd className="mt-1 text-slate-700">Version {campaign.currentContentVersion ?? "—"}</dd></div>
                    <div><dt className="text-xs text-slate-400">Recipients</dt><dd className="mt-1 text-slate-700">{campaignRecipients.length}</dd></div>
                    <div><dt className="text-xs text-slate-400">Basis</dt><dd className="mt-1 text-slate-700">Marketing consent</dd></div>
                  </dl>
                  <div className="text-sm lg:text-right">
                    <p className="text-slate-500">Updated</p>
                    <p className="mt-1 font-medium text-slate-700">{format(new Date(campaign.updatedAt), "d MMM yyyy, HH:mm")}</p>
                    <p className="mt-2 text-xs text-slate-400">{campaign.approvedBy ? `Approved by ${campaign.approvedBy}` : "Human approval required"}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <h2 className="font-semibold">Delivery safeguards</h2>
        <p className="mt-1">Every launch rechecks tenant ownership, approved products, accepted allocation, marketing consent, suppression status, current content approval, and verified sending identity.</p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
