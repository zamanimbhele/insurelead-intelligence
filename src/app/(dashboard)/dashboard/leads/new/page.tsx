import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDashboardIdentity } from "@/lib/auth";
import { getProductCatalogue } from "@/lib/product-catalogue";
import { canAddLeads, getStaffLeadProductOptions } from "@/lib/staff-leads";
import { NewLeadForm } from "@/components/dashboard/NewLeadForm";

export const metadata = { title: "New lead | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const identity = await getDashboardIdentity();
  // Convenience only: /api/leads/staff and the database function refuse
  // anyone who is not an active broker administrator or agent.
  if (!canAddLeads(identity)) redirect("/dashboard/leads");

  const { individual, business } = await getStaffLeadProductOptions(identity, await getProductCatalogue());

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Leads
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">New lead</h1>
        <p className="mt-1 text-sm text-slate-500">
          Record someone who contacted your practice by phone, referral or in person.
        </p>
      </div>
      <NewLeadForm products={{ individual, business }} />
    </div>
  );
}
