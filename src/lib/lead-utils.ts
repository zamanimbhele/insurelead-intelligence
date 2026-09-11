import { BUSINESS_COVER_OPTIONS, INSURANCE_PRODUCTS } from "./constants";
import type { Lead } from "./types";

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
