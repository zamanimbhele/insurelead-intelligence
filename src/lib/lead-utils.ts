import { BUSINESS_COVER_OPTIONS } from "./constants";
import { FALLBACK_CATALOGUE, productLabelMap } from "./products";

const BUILT_IN_PRODUCT_LABELS = productLabelMap(FALLBACK_CATALOGUE);
import type { ConsentRecord, Lead, LeadStatus } from "./types";

export function getLeadDisplayName(lead: Lead) {
  return lead.applicantType === "business" && lead.businessName
    ? lead.businessName
    : lead.contactFullName;
}

// `labels` comes from the live catalogue (productLabelMap); without it the
// built-in names are used.
export function getInsuranceProductLabels(lead: Lead, labels: ReadonlyMap<string, string> = BUILT_IN_PRODUCT_LABELS) {
  return lead.insuranceProducts.map(
    (value) => labels.get(value) ?? value.replace(/_/g, " "),
  );
}

export function getBusinessCoverLabels(lead: Lead) {
  return (lead.businessCoverInterests ?? []).map(
    (value) => BUSINESS_COVER_OPTIONS.find((cover) => cover.value === value)?.label ?? value.replace(/_/g, " "),
  );
}

// The "Do Not Contact" flag and the dedicated do_not_contact pipeline status
// are kept in sync in one place: moving a lead into that column always sets
// the flag, and moving it back out clears a flag that was only set because
// of that column (an operator-set flag from a future, dedicated Do Not
// Contact action would need its own independent field to survive this -
// see BACKLOG.md "Do Not Contact workflow enforcement").
export function resolveDoNotContactForStatus(
  previousStatus: LeadStatus,
  nextStatus: LeadStatus,
  currentlyDoNotContact: boolean,
): boolean {
  if (nextStatus === "do_not_contact") return true;
  if (previousStatus === "do_not_contact") return false;
  return currentlyDoNotContact;
}

// Mirrors the five literal(true) checks the public consultation form
// enforces (src/lib/validation/consultationSchema.ts) and that
// capture_public_lead() originally enforced server-side. A lead missing any
// of these - or with no consent record at all - should never have reached
// the pipeline through the real form; this is the compliance dashboard's
// safety net for anything that did (a historical import, a migration gap,
// manual broker entry), not an expectation that it fires often.
export function isConsentValid(consent: ConsentRecord | undefined | null): boolean {
  if (!consent) return false;
  return Boolean(
    consent.privacyNoticeAccepted &&
      consent.contactConsent &&
      consent.partnerSharingConsent &&
      consent.accuracyConfirmed &&
      consent.nonBindingAcknowledged,
  );
}

// Legal-text documents (project brief section 2) store multi-paragraph
// content as plain text with a blank line between paragraphs - see
// LEGAL_TEXT_DOCUMENT_DEFINITIONS in constants.ts and the matching seed
// data in supabase/migrations/202610080001_legal_text_documents.sql.
// Splitting here, once, keeps every renderer (Privacy Notice, Terms of
// Use, the admin Legal Content page's read-only preview) agreeing on what
// counts as a paragraph break, rather than each page reimplementing it.
export function renderLegalTextParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
