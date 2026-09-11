import Link from "next/link";
import { format } from "date-fns";
import { AllocationResponseButtons } from "@/components/dashboard/AllocationResponseButtons";
import { canRespondToAllocations, getDashboardIdentity } from "@/lib/auth";
import { getDashboardAllocationData } from "@/lib/dashboard-data";
import { getLeadDisplayName } from "@/lib/lead-utils";

export const dynamic = "force-dynamic";

export default async function AllocationsPage() {
  const identity = await getDashboardIdentity();
  const { leads, buyers, allocations } = await getDashboardAllocationData();
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const buyersById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
  const pending = allocations.filter((allocation) => allocation.status === "reserved").length;
  const accepted = allocations.filter((allocation) => allocation.status === "accepted").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Lead Allocations</h1>
        <p className="mt-1 text-sm text-slate-500">
          {identity.organisationType === "broker" || identity.organisationType === "insurer"
            ? "Review leads allocated to your organisation and record an acceptance or release."
            : "Monitor allocations across participating broker and insurer organisations."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total allocations" value={allocations.length} />
        <Metric label="Awaiting response" value={pending} />
        <Metric label="Accepted" value={accepted} />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">Allocation queue</h2>
        </div>
        {allocations.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">No lead allocations are available.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {allocations.map((allocation) => {
              const lead = leadsById.get(allocation.leadId);
              const buyer = buyersById.get(allocation.buyerId);
              return (
                <article key={allocation.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[1.4fr_1fr_0.8fr_auto] lg:items-center">
                  <div>
                    {lead ? (
                      <Link href={`/dashboard/leads/${lead.id}`} className="font-semibold text-primary-700 hover:underline">
                        {getLeadDisplayName(lead)}
                      </Link>
                    ) : (
                      <p className="font-mono text-xs text-slate-500">Lead {allocation.leadId}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">Allocated {format(new Date(allocation.allocatedAt), "d MMM yyyy, HH:mm")}</p>
                  </div>
                  <p className="text-sm text-slate-600">{buyer?.organisationName ?? identity.organisationName}</p>
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">
                    {allocation.status}
                  </span>
                  {allocation.status === "reserved" && canRespondToAllocations(identity) ? (
                    <AllocationResponseButtons allocationId={allocation.id} />
                  ) : <span className="text-xs text-slate-400">{allocation.exclusive ? "Exclusive" : "Shared"}</span>}
                </article>
              );
            })}
          </div>
        )}
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
