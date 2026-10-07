import { describe, expect, it } from "vitest";
import {
  getBusinessCoverLabels,
  getInsuranceProductLabels,
  getLeadDisplayName,
  isConsentValid,
  resolveDoNotContactForStatus,
} from "./lead-utils";
import type { ConsentRecord, Lead } from "./types";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_test",
    applicantType: "business",
    province: "Gauteng",
    city: "Johannesburg",
    insuranceProducts: ["business_insurance"],
    currentInsuranceStatus: "unsure",
    preferredContactChannel: "email",
    contactFullName: "Jane Broker",
    contactEmail: "jane@example.com",
    contactMobile: "0821234567",
    status: "new",
    score: 0,
    scoreBand: "nurture",
    scoreExplanation: "",
    utm: {},
    doNotContact: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeConsent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    leadId: "lead_test",
    privacyNoticeAccepted: true,
    contactConsent: true,
    marketingConsent: false,
    partnerSharingConsent: true,
    maxPartnerRecipients: 1,
    accuracyConfirmed: true,
    nonBindingAcknowledged: true,
    consentWordingVersion: "v1",
    sourceUrl: "https://example.com/consultation",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("getLeadDisplayName", () => {
  it("uses the business name for a business applicant with one set", () => {
    const lead = makeLead({ applicantType: "business", businessName: "Acme Traders", contactFullName: "Jane Broker" });
    expect(getLeadDisplayName(lead)).toBe("Acme Traders");
  });

  it("falls back to the contact's full name for a business applicant with no business name", () => {
    const lead = makeLead({ applicantType: "business", businessName: undefined, contactFullName: "Jane Broker" });
    expect(getLeadDisplayName(lead)).toBe("Jane Broker");
  });

  it("uses the contact's full name for an individual applicant, even if a business name is set", () => {
    const lead = makeLead({ applicantType: "individual", businessName: "Acme Traders", contactFullName: "Jane Broker" });
    expect(getLeadDisplayName(lead)).toBe("Jane Broker");
  });
});

describe("getInsuranceProductLabels / getBusinessCoverLabels", () => {
  it("maps a known product value to its display label", () => {
    const lead = makeLead({ insuranceProducts: ["motor_insurance"] });
    expect(getInsuranceProductLabels(lead)).toEqual(["Motor Insurance"]);
  });

  it("falls back to a humanised raw value for an unrecognised product code", () => {
    const lead = makeLead({ insuranceProducts: ["some_future_product" as Lead["insuranceProducts"][number]] });
    expect(getInsuranceProductLabels(lead)).toEqual(["some future product"]);
  });

  it("returns an empty array when a lead has no business cover interests set", () => {
    const lead = makeLead({ businessCoverInterests: undefined });
    expect(getBusinessCoverLabels(lead)).toEqual([]);
  });
});

describe("resolveDoNotContactForStatus", () => {
  it("sets the flag when the lead moves into do_not_contact", () => {
    expect(resolveDoNotContactForStatus("new", "do_not_contact", false)).toBe(true);
  });

  it("clears the flag when the lead moves out of do_not_contact", () => {
    expect(resolveDoNotContactForStatus("do_not_contact", "nurture", true)).toBe(false);
  });

  it("leaves the flag untouched for a status change unrelated to do_not_contact", () => {
    expect(resolveDoNotContactForStatus("new", "contacted", false)).toBe(false);
    expect(resolveDoNotContactForStatus("qualified", "won", false)).toBe(false);
  });
});

describe("isConsentValid", () => {
  it("returns false when there is no consent record at all", () => {
    expect(isConsentValid(undefined)).toBe(false);
    expect(isConsentValid(null)).toBe(false);
  });

  it("returns true when all five required consent checks are satisfied", () => {
    expect(isConsentValid(makeConsent())).toBe(true);
  });

  it.each([
    "privacyNoticeAccepted",
    "contactConsent",
    "partnerSharingConsent",
    "accuracyConfirmed",
    "nonBindingAcknowledged",
  ] as const)("returns false when %s is missing, even if every other check passes", (field) => {
    const consent = makeConsent({ [field]: false });
    expect(isConsentValid(consent)).toBe(false);
  });

  it("does not require marketingConsent - that one is optional/separate from validity", () => {
    expect(isConsentValid(makeConsent({ marketingConsent: false }))).toBe(true);
  });
});
