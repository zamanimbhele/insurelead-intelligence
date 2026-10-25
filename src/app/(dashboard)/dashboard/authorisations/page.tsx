import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { listAuthorisations } from "@/lib/authorisation-service";
import {
  AUTHORISATION_STATUS_LABELS,
  evidenceLabel,
  expiringSoon,
  isExpired,
  type PractitionerAuthorisation,
} from "@/lib/authorisations";
import { getProductCatalogue } from "@/lib/product-catalogue";
import { isPlatformStaffRole } from "@/lib/portal";
import { AuthorisationReviewControls } from "@/components/dashboard/AuthorisationControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Authorisations | InsureLead Intelligence" };

function Row({ item, categoryName, canReview }: { item: PractitionerAuthorisation; categoryName: string; canReview: boolean }) {
  return (
    <li className="py-4" data-testid="authorisation-row">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{item.holderName} · {categoryName}</p>
          <p className="text-xs text-slate-500">{item.organisationName ?? item.organisationId}</p>
          <p className="mt-1 text-xs text-slate-600">
            {evidenceLabel(item.evidenceType)}: <span className="font-medium">{item.referenceNumber}</span>
            {item.providerName ? ` · ${item.providerName}` : ""}
            {item.expiresOn ? ` · expires ${item.expiresOn}` : ""}
          </p>
          {item.evidenceNote && <p className="mt-1 text-xs italic text-slate-500">“{item.evidenceNote}”</p>}
          {item.reviewNote && <p className="mt-1 text-xs text-slate-500">Review note: {item.reviewNote}</p>}
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {item.status === "verified" && isExpired(item) ? "Expired" : AUTHORISATION_STATUS_LABELS[item.status]}
        </span>
      </div>
      {canReview && (item.status === "pending" || item.status === "verified") && (
        <AuthorisationReviewControls id={item.id} status={item.status} />
      )}
    </li>
  );
}

export default async function AuthorisationsPage() {
  const identity = await getDashboardIdentity();
  if (!isPlatformStaffRole(identity.role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">Authorisations</h1>
        <p className="mt-2 text-sm text-amber-900">Reviewing authorisations is restricted to InsureLead platform staff.</p>
      </div>
    );
  }
  const canReview = isPlatformAdmin(identity);
  const [authorisations, catalogue] = await Promise.all([listAuthorisations(identity), getProductCatalogue()]);
  const categoryName = (id: string) => catalogue.categories.find((category) => category.id === id)?.name ?? id;
  const pending = authorisations.filter((item) => item.status === "pending").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const expiring = expiringSoon(authorisations, 30);
  const verified = authorisations.filter((item) => item.status === "verified");
  const closed = authorisations.filter((item) => !["pending", "verified"].includes(item.status));

  const section = (title: string, items: PractitionerAuthorisation[], empty: string, testId: string) => (
    <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid={testId}>
      <h2 className="font-semibold text-slate-900">{title} <span className="text-sm font-normal text-slate-400">({items.length})</span></h2>
      {items.length === 0 ? <p className="mt-3 text-sm text-slate-500">{empty}</p> : (
        <ul className="mt-2 divide-y divide-slate-100">
          {items.map((item) => <Row key={item.id} item={item} categoryName={categoryName(item.categoryId)} canReview={canReview} />)}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Authorisations</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          What each broker and advisor has said they are licensed or accredited to sell. Check the evidence against the
          relevant register (for example the FSCA register) before verifying.
          {!canReview && " You have read-only access."}
        </p>
        <p className="mt-2 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The evidence guidance shown to advisors is placeholder wording until a compliance officer confirms it.
        </p>
      </div>
      {section("Awaiting review", pending, "Nothing to review.", "authorisations-pending")}
      {section("Expiring within 30 days", expiring, "Nothing expires in the next 30 days.", "authorisations-expiring")}
      {section("Verified", verified, "No verified authorisations yet.", "authorisations-verified")}
      {section("Rejected, revoked or withdrawn", closed, "None.", "authorisations-closed")}
    </div>
  );
}
