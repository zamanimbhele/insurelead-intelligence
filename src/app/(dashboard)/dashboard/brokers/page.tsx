import { getDashboardIdentity, isComplianceAuditor, isPlatformAdmin } from "@/lib/auth";
import { getDashboardBrokerDirectory } from "@/lib/dashboard-data";
import { INSURANCE_PRODUCTS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const productLabels = new Map(INSURANCE_PRODUCTS.map((product) => [product.value, product.label]));

export default async function BrokerDirectoryPage() {
  const identity = await getDashboardIdentity();
  if (!isPlatformAdmin(identity) && !isComplianceAuditor(identity)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">Broker Directory</h1>
        <p className="mt-2 text-sm text-amber-900">The cross-organisation directory is restricted to platform oversight roles.</p>
      </div>
    );
  }

  const { buyers, sendingIdentities } = await getDashboardBrokerDirectory();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Broker Directory</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Approved product appetite, territory, capacity, service levels, and sending-identity readiness for every tenant.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {buyers.map((buyer) => {
          const identities = sendingIdentities.filter((item) => item.organisationId === buyer.id);
          return (
            <article key={buyer.id} data-testid="broker-card" className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-900">{buyer.organisationName}</h2>
                  <p className="mt-1 text-xs text-slate-500">{buyer.buyerType} · {buyer.fspNumber ?? "FSP number pending"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${buyer.status === "active" && buyer.onboardingStatus === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {buyer.onboardingStatus} · {buyer.status}
                </span>
              </div>

              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-slate-400">Daily capacity</dt><dd className="font-semibold text-slate-800">{buyer.dailyLeadCapacity} leads/day</dd></div>
                <div><dt className="text-slate-400">Contact SLA</dt><dd className="font-semibold text-slate-800">{buyer.contactSlaHours}h</dd></div>
                <div><dt className="text-slate-400">Lead model</dt><dd className="font-semibold text-slate-800">{buyer.acceptsSharedLeads ? "Shared allowed" : "Exclusive only"}</dd></div>
              </dl>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Approved products</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {buyer.insuranceProducts.map((product) => (
                    <span key={product} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                      {productLabels.get(product) ?? product}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-slate-400">Province coverage</p><p className="mt-1 text-slate-600">{buyer.provinces.join(", ") || "National"}</p></div>
                <div><p className="text-xs text-slate-400">City coverage</p><p className="mt-1 text-slate-600">{buyer.cities.join(", ") || "All cities in approved provinces"}</p></div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sending identities</p>
                {identities.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-700">No sending identity configured</p>
                ) : identities.map((sendingIdentity) => (
                  <div key={sendingIdentity.id} className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600">{sendingIdentity.fromEmail}</span>
                    <span className={sendingIdentity.status === "verified" ? "text-emerald-700" : "text-amber-700"}>
                      {sendingIdentity.status}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
