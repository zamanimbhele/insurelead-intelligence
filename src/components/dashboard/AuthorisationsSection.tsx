import {
  AUTHORISATION_STATUS_LABELS,
  authorisedCategoryIds,
  categoryStanding,
  evidenceLabel,
  todayIso,
  type PractitionerAuthorisation,
} from "@/lib/authorisations";
import type { ProductCatalogue } from "@/lib/products";
import { AuthorisationForm, WithdrawAuthorisationButton } from "./AuthorisationControls";

const STANDING_STYLES = {
  authorised: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-800",
  expired: "bg-red-50 text-red-700",
  none: "bg-slate-100 text-slate-600",
} as const;

// "Licences and authorisations" on a broker's or advisor's own page.
export function AuthorisationsSection({
  catalogue,
  authorisations,
  profileId,
  organisationId,
  organisationNoun,
  canSubmit,
  showTeam,
}: {
  catalogue: ProductCatalogue;
  authorisations: PractitionerAuthorisation[];
  profileId: string;
  organisationId: string;
  organisationNoun: string;
  canSubmit: boolean;
  showTeam: boolean;
}) {
  const today = todayIso();
  const categories = catalogue.categories
    .filter((category) => category.status !== "retired")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const organisationCategories = new Set(authorisedCategoryIds(authorisations, organisationId, today));
  const team = authorisations.filter((item) => item.profileId !== profileId && item.organisationId === organisationId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="authorisations-section">
      <h2 className="font-semibold text-slate-900">Licences and authorisations</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Leads and campaigns are only available for product categories someone in {organisationNoun} holds a verified
        authorisation for. The InsureLead team checks each one.
      </p>

      <ul className="mt-4 divide-y divide-slate-100">
        {categories.map((category) => {
          const { state, authorisation } = categoryStanding(authorisations, profileId, category.id, today);
          const label = state === "authorised" ? "Authorised" : state === "pending" ? "Awaiting review" : state === "expired" ? "Expired" : "Not recorded";
          return (
            <li key={category.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm" data-testid={`authorisation-${category.id}`}>
              <div>
                <p className="font-medium text-slate-800">
                  {category.name}
                  {category.status !== "active" && <span className="ml-2 text-xs font-normal text-slate-400">Not yet offered on InsureLead</span>}
                </p>
                {authorisation && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {evidenceLabel(authorisation.evidenceType)} · {authorisation.referenceNumber}
                    {authorisation.providerName ? ` · ${authorisation.providerName}` : ""}
                    {authorisation.expiresOn ? ` · expires ${authorisation.expiresOn}` : ""}
                  </p>
                )}
                {authorisation && state === "none" && authorisation.reviewNote && (
                  <p className="mt-0.5 text-xs text-red-700">
                    {AUTHORISATION_STATUS_LABELS[authorisation.status]}: {authorisation.reviewNote}
                  </p>
                )}
                {state !== "authorised" && organisationCategories.has(category.id) && (
                  <p className="mt-0.5 text-xs text-emerald-700">A colleague is authorised for this category.</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STANDING_STYLES[state]}`}>{label}</span>
                {authorisation && ["pending", "verified"].includes(authorisation.status) && <WithdrawAuthorisationButton id={authorisation.id} />}
              </div>
            </li>
          );
        })}
      </ul>

      {showTeam && team.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Team authorisations</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {team.map((item) => (
              <li key={item.id}>
                {item.holderName}: {catalogue.categories.find((category) => category.id === item.categoryId)?.name ?? item.categoryId}
                {" "}· {AUTHORISATION_STATUS_LABELS[item.status]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canSubmit && (
        <AuthorisationForm
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            offered: category.status === "active",
            acceptedEvidence: category.acceptedEvidence,
            evidenceGuidance: category.evidenceGuidance,
            guidanceIsPlaceholder: category.guidanceIsPlaceholder,
          }))}
        />
      )}
    </section>
  );
}
