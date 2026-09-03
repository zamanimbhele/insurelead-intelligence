import { AllocateLeadButton } from "@/components/dashboard/AllocateLeadButton";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDashboardMarketplaceData } from "@/lib/dashboard-data";
import { getAllocationEligibility, getEligibleBuyersForLead } from "@/lib/marketplace-store";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const identity = await getDashboardIdentity();
  if (!isPlatformAdmin(identity)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">Lead Marketplace</h1>
        <p className="mt-2 text-sm text-amber-900">
          Marketplace inventory and allocation controls are restricted to platform and compliance administrators.
        </p>
      </div>
    );
  }

  const { leads, buyers, allocations, consents } = await getDashboardMarketplaceData();
  const inventory = leads
    .filter((lead) => getAllocationEligibility(lead, consents.get(lead.id), allocations).allowed)
    .map((lead) => ({
      lead,
      buyers: getEligibleBuyersForLead(lead, buyers),
      consent: consents.get(lead.id),
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Lead Marketplace</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review consented inventory and reserve leads for approved pilot buyers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Eligible inventory" value={inventory.length} />
        <Metric label="Active buyers" value={buyers.filter((buyer) => buyer.status === "active").length} />
        <Metric label="Active reservations" value={allocations.filter((allocation) => allocation.status !== "released").length} />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Available qualified enquiries</h2>
        </div>
        {inventory.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-slate-700">No enquiries are currently eligible for allocation.</p>
            <p className="mt-1 text-sm text-slate-500">New submissions need contact and partner-sharing consent.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {inventory.map(({ lead, buyers: matches, consent }) => (
              <article key={lead.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                <div>
                  <p className="font-semibold text-slate-900">{lead.businessName}</p>
                  <p className="text-sm text-slate-500">{lead.industry} · {lead.city}, {lead.province}</p>
                  <p className="mt-1 text-xs text-slate-400">Score {lead.score}/100 · Recipient limit {consent?.maxPartnerRecipients ?? 1}</p>
                </div>
                <p className="text-sm text-slate-700">{matches[0]?.organisationName ?? "No matching buyer appetite"}</p>
                {matches[0] && <AllocateLeadButton leadId={lead.id} buyerId={matches[0].id} />}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Pilot buyers</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {buyers.map((buyer) => (
            <div key={buyer.id} className="rounded-lg border border-slate-200 p-4">
              <p className="font-medium text-slate-800">{buyer.organisationName}</p>
              <p className="mt-2 text-sm text-slate-500">{buyer.buyerType} · Minimum score {buyer.minimumScore}</p>
            </div>
          ))}
        </div>
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
