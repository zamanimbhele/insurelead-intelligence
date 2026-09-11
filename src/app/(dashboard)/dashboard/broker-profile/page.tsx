import { getDashboardIdentity, isBrokerUser } from "@/lib/auth";
import { getDashboardBrokerWorkspace } from "@/lib/dashboard-data";
import { INSURANCE_PRODUCTS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const productLabels = new Map(INSURANCE_PRODUCTS.map((product) => [product.value, product.label]));

export default async function BrokerProfilePage() {
  const identity = await getDashboardIdentity();
  if (identity.mode === "supabase" && !isBrokerUser(identity)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">Broker Profile</h1>
        <p className="mt-2 text-sm text-amber-900">This workspace is available to broker and insurer organisation members.</p>
      </div>
    );
  }

  const workspace = await getDashboardBrokerWorkspace(identity);
  const buyer = workspace?.buyer;
  if (!workspace || !buyer) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">Broker Profile</h1>
        <p className="mt-2 text-sm text-amber-900">No buyer profile is associated with this organisation.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Broker Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Tenant configuration for {buyer.organisationName}.</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{buyer.organisationName}</h2>
            <p className="mt-1 text-sm text-slate-500">{buyer.contactEmail} · {buyer.fspNumber ?? "FSP number pending"}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{buyer.onboardingStatus} · {buyer.status}</span>
        </div>
        <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div><dt className="text-slate-400">Daily capacity</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.dailyLeadCapacity} leads</dd></div>
          <div><dt className="text-slate-400">Contact SLA</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.contactSlaHours} hours</dd></div>
          <div><dt className="text-slate-400">Minimum score</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.minimumScore}/100</dd></div>
          <div><dt className="text-slate-400">Shared leads</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.acceptsSharedLeads ? "Accepted" : "Not accepted"}</dd></div>
          <div><dt className="text-slate-400">Campaigns</dt><dd className="mt-1 font-semibold text-slate-800">{buyer.acceptsCampaigns ? "Enabled" : "Disabled"}</dd></div>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Approved appetite</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {buyer.insuranceProducts.map((product) => (
              <span key={product} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                {productLabels.get(product) ?? product}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-600"><span className="text-slate-400">Provinces:</span> {buyer.provinces.join(", ") || "National"}</p>
          <p className="mt-2 text-sm text-slate-600"><span className="text-slate-400">Cities:</span> {buyer.cities.join(", ") || "All cities in approved provinces"}</p>
          <p className="mt-2 text-sm text-slate-600"><span className="text-slate-400">Industries:</span> {buyer.industries.join(", ") || "All industries"}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Sending identities</h2>
          <p className="mt-1 text-xs text-slate-400">Only verified identities can be used when campaign delivery is enabled.</p>
          <div className="mt-4 space-y-3">
            {workspace.sendingIdentities.length === 0 ? <p className="text-sm text-amber-700">No identity configured.</p> : workspace.sendingIdentities.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex justify-between gap-3"><span className="text-sm font-medium text-slate-800">{item.fromName}</span><span className="text-xs capitalize text-slate-500">{item.status}</span></div>
                <p className="mt-1 text-sm text-slate-600">{item.fromEmail}</p>
                <p className="mt-1 text-xs text-slate-400">{item.domain}{item.isDefault ? " · default" : ""}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Organisation members</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {workspace.members.length === 0 ? <p className="text-sm text-slate-500">No demo members are listed.</p> : workspace.members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div><p className="font-medium text-slate-800">{member.displayName ?? "Broker user"}</p><p className="text-xs text-slate-400">{member.jobTitle ?? member.role.replaceAll("_", " ")}</p></div>
              <span className="capitalize text-slate-500">{member.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
