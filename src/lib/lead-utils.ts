import { BUSINESS_COVER_OPTIONS, INSURANCE_PRODUCTS } from "./constants";
import type { Lead, LeadStatus } from "./types";

export function getLeadDisplayName(lead: Lead) {
  return lead.applicantType === "business" && lead.businessName
    ? lead.businessName
    : lead.contactFullName;
}

export function getInsuranceProductLabels(lead: Lead) {
  return lead.insuranceProducts.map(
    (value) => INSURANCE_PRODUCTS.find((product) => product.value === value)?.label ?? value.replace(/_/g, " "),
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
