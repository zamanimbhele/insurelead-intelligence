// Per-person authorisation (individual advisors plan, phase 3): who may
// sell which product category, on what evidence. Pure data and helpers,
// safe for client components. The database enforces the same rules
// (migration 202610250003_practitioner_authorisations.sql); demo mode
// enforces them through these helpers.
import type { ProductCatalogue } from "./products.ts";

export type EvidenceType =
  | "fsp_licence"
  | "representative_appointment"
  | "cms_accreditation"
  | "ncr_registration"
  | "bank_mandate";

export type AuthorisationStatus = "pending" | "verified" | "rejected" | "revoked" | "withdrawn";

export type PractitionerAuthorisation = {
  id: string;
  profileId: string;
  holderName: string;
  organisationId: string;
  organisationName?: string;
  categoryId: string;
  evidenceType: EvidenceType;
  referenceNumber: string;
  providerName?: string;
  evidenceNote?: string;
  status: AuthorisationStatus;
  expiresOn?: string; // YYYY-MM-DD
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  // False when the holder's membership is no longer active: their
  // authorisation stops counting for the organisation.
  holderActive: boolean;
};

// PLACEHOLDER wording: common practice, to be confirmed by a compliance
// officer before go-live (see docs/AUTHORISATIONS.md).
export const EVIDENCE_TYPES: { value: EvidenceType; label: string; referenceLabel: string; providerLabel?: string }[] = [
  { value: "fsp_licence", label: "Own FSP licence", referenceLabel: "FSP licence number" },
  { value: "representative_appointment", label: "Representative of an FSP", referenceLabel: "FSP number of the FSP you represent", providerLabel: "Name of the FSP you represent" },
  { value: "cms_accreditation", label: "Council for Medical Schemes accreditation", referenceLabel: "CMS accreditation number", providerLabel: "FSP you act for" },
  { value: "ncr_registration", label: "National Credit Regulator registration", referenceLabel: "NCR registration number" },
  { value: "bank_mandate", label: "Bank or credit provider mandate", referenceLabel: "Mandate or agreement reference", providerLabel: "Bank or credit provider" },
];

export const AUTHORISATION_STATUS_LABELS: Record<AuthorisationStatus, string> = {
  pending: "Awaiting review",
  verified: "Verified",
  rejected: "Rejected",
  revoked: "Revoked",
  withdrawn: "Withdrawn",
};

export function evidenceLabel(type: string): string {
  return EVIDENCE_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isExpired(authorisation: Pick<PractitionerAuthorisation, "expiresOn">, today = todayIso()): boolean {
  return Boolean(authorisation.expiresOn && authorisation.expiresOn < today);
}

// Counts towards what the organisation may sell.
export function isEffective(authorisation: PractitionerAuthorisation, today = todayIso()): boolean {
  return authorisation.status === "verified" && authorisation.holderActive && !isExpired(authorisation, today);
}

export function authorisedCategoryIds(authorisations: readonly PractitionerAuthorisation[], organisationId: string, today = todayIso()): string[] {
  return [...new Set(authorisations
    .filter((item) => item.organisationId === organisationId && isEffective(item, today))
    .map((item) => item.categoryId))].sort();
}

export function authorisedProductIds(
  catalogue: ProductCatalogue,
  authorisations: readonly PractitionerAuthorisation[],
  organisationId: string,
  today = todayIso(),
): string[] {
  const categories = new Set(authorisedCategoryIds(authorisations, organisationId, today));
  return catalogue.products.filter((product) => categories.has(product.categoryId)).map((product) => product.value).sort();
}

// Verified authorisations that lapse within `days` (and have not yet).
export function expiringSoon(authorisations: readonly PractitionerAuthorisation[], days = 30, now = new Date()): PractitionerAuthorisation[] {
  const today = todayIso(now);
  const limit = todayIso(new Date(now.getTime() + days * 86_400_000));
  return authorisations.filter((item) =>
    item.status === "verified" && item.expiresOn && item.expiresOn >= today && item.expiresOn <= limit);
}

// What the person sees next to each category on their own page.
export function categoryStanding(
  authorisations: readonly PractitionerAuthorisation[],
  profileId: string,
  categoryId: string,
  today = todayIso(),
): { state: "authorised" | "pending" | "expired" | "none"; authorisation?: PractitionerAuthorisation } {
  const mine = authorisations
    .filter((item) => item.profileId === profileId && item.categoryId === categoryId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const verified = mine.find((item) => item.status === "verified");
  if (verified) return { state: isExpired(verified, today) ? "expired" : "authorised", authorisation: verified };
  const pending = mine.find((item) => item.status === "pending");
  if (pending) return { state: "pending", authorisation: pending };
  return { state: "none", authorisation: mine[0] };
}

// Same messages the database functions raise, so whichever layer catches
// a problem, the person reads the same thing.
export const AUTHORISATION_ERRORS = [
  "Only an active broker or advisor may record an authorisation",
  "Product category not found",
  "That evidence is not accepted for this category",
  "A reference number is required",
  "The expiry date has already passed",
  "You already have a pending or verified authorisation for this category",
  "Only a platform administrator may review authorisations",
  "Decision must be verify, reject or revoke",
  "Authorisation not found",
  "Only a pending authorisation can be verified or rejected",
  "Only a verified authorisation can be revoked",
  "Give a reason the holder will see",
  "Only a pending or verified authorisation can be withdrawn",
];

// Only known rule messages reach the browser; anything else is generic.
export function safeAuthorisationError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return AUTHORISATION_ERRORS.find((candidate) => message.includes(candidate)) ?? fallback;
}
