import { redirect } from "next/navigation";
import { canManageCompliance, canViewCompliance, getDashboardIdentity } from "@/lib/auth";
import { getDashboardLegalTextDocuments } from "@/lib/dashboard-data";
import { LegalContentManager } from "@/components/dashboard/LegalContentManager";

export const metadata = { title: "Legal Content | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function LegalContentPage() {
  const identity = await getDashboardIdentity();
  if (!canViewCompliance(identity)) redirect("/access-denied");

  const documents = await getDashboardLegalTextDocuments();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Legal Content</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          The 7 configurable legal-text fields the platform brief requires (privacy notice, consent wording, contact
          permission wording, marketing wording, FSP disclosures, terms of use, and the data retention policy text).
          Every save bumps the document&apos;s version, keeps the prior version in its history, and is written to the
          audit log. Changes here take effect immediately on the public site and the consultation form.
        </p>
      </div>
      <LegalContentManager documents={documents} canManage={canManageCompliance(identity)} />
    </div>
  );
}
