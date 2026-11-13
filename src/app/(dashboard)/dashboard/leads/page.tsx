import { getDashboardIdentity, canUpdateLeadStatus } from "@/lib/auth";
import { getDashboardLeads } from "@/lib/dashboard-data";
import { getDataMode } from "@/lib/supabase/config";
import Link from "next/link";
import { Plus } from "lucide-react";
import { LeadsWorkspace } from "@/components/dashboard/LeadsWorkspace";
import { canAddLeads } from "@/lib/staff-leads";
import { getProductCatalogue } from "@/lib/product-catalogue";
import { productFilterOptions } from "@/lib/products";

export const metadata = { title: "Leads | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [identity, leads, catalogue] = await Promise.all([getDashboardIdentity(), getDashboardLeads(), getProductCatalogue()]);
  const demoMode = getDataMode() === "demo";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leads.length} {demoMode ? "synthetic demo" : "accessible"} leads.
            {!demoMode && " Row Level Security limits this list to records available to your organisation and role."}
          </p>
        </div>
        {canAddLeads(identity) && (
          <Link
            href="/dashboard/leads/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> Add lead
          </Link>
        )}
      </div>
      <LeadsWorkspace leads={leads} demoMode={demoMode} canEdit={canUpdateLeadStatus(identity)} productOptions={productFilterOptions(catalogue, leads)} />
    </div>
  );
}
