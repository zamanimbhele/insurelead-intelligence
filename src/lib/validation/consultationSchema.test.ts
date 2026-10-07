import { describe, expect, it } from "vitest";
import { consultationFormSchema } from "./consultationSchema";

function validBusinessSubmission(overrides: Record<string, unknown> = {}) {
  return {
    applicantType: "business",
    businessName: "Acme Traders",
    industry: "Retail",
    businessType: "Pty Ltd",
    employeeBand: "21-50",
    turnoverBand: "R10 million - R20 million",
    yearsInOperation: "6-10",
    province: "Gauteng",
    city: "Johannesburg",
    insuranceProducts: ["business_insurance"],
    businessCoverInterests: ["public_liability"],
    currentInsuranceStatus: "currently_insured",
    preferredContactChannel: "email",
    contactFullName: "Jane Broker",
    contactRole: "Owner",
    contactEmail: "jane@example.com",
    contactMobile: "0821234567",
    preferredContactMethod: "email",
    privacyNoticeAccepted: true,
    contactConsent: true,
    partnerSharingConsent: true,
    accuracyConfirmed: true,
    nonBindingAcknowledged: true,
    website_url: "", // honeypot - must stay empty
    ...overrides,
  };
}

function validIndividualSubmission(overrides: Record<string, unknown> = {}) {
  return {
    applicantType: "individual",
    province: "Western Cape",
    city: "Cape Town",
    insuranceProducts: ["motor_insurance"],
    currentInsuranceStatus: "not_currently_insured",
    preferredContactChannel: "phone",
    contactFullName: "John Individual",
    contactEmail: "john@example.com",
    contactMobile: "0831234567",
    preferredContactMethod: "phone",
    privacyNoticeAccepted: true,
    contactConsent: true,
    partnerSharingConsent: true,
    accuracyConfirmed: true,
    nonBindingAcknowledged: true,
    ...overrides,
  };
}

describe("consultationFormSchema - happy paths", () => {
  it("accepts a fully valid business submission", () => {
    const result = consultationFormSchema.safeParse(validBusinessSubmission());
    expect(result.success).toBe(true);
  });

  it("accepts a fully valid individual submission", () => {
    const result = consultationFormSchema.safeParse(validIndividualSubmission());
    expect(result.success).toBe(true);
  });

  it("defaults marketingConsent to false and maxPartnerRecipients to '1' when omitted", () => {
    const result = consultationFormSchema.safeParse(validIndividualSubmission());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.marketingConsent).toBe(false);
      expect(result.data.maxPartnerRecipients).toBe("1");
    }
  });
});

describe("consultationFormSchema - consent is mandatory, not pre-selected", () => {
  it.each([
    "privacyNoticeAccepted",
    "contactConsent",
    "partnerSharingConsent",
    "accuracyConfirmed",
    "nonBindingAcknowledged",
  ] as const)("rejects when %s is false", (field) => {
    const result = consultationFormSchema.safeParse(validIndividualSubmission({ [field]: false }));
    expect(result.success).toBe(false);
  });

  it("does not require marketingConsent to be true - it is optional, future-marketing-only", () => {
    const result = consultationFormSchema.safeParse(validIndividualSubmission({ marketingConsent: false }));
    expect(result.success).toBe(true);
  });
});

describe("consultationFormSchema - honeypot field", () => {
  it("rejects a submission where the hidden website_url honeypot was filled in", () => {
    const result = consultationFormSchema.safeParse(validBusinessSubmission({ website_url: "http://spambot.example" }));
    expect(result.success).toBe(false);
  });

  it("accepts a submission where the honeypot was left empty or omitted", () => {
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ website_url: "" })).success).toBe(true);
    const withoutHoneypot: Record<string, unknown> = validBusinessSubmission();
    delete withoutHoneypot.website_url;
    expect(consultationFormSchema.safeParse(withoutHoneypot).success).toBe(true);
  });
});

describe("consultationFormSchema - business-only required fields", () => {
  it("requires businessName, industry, businessType, employeeBand, turnoverBand, yearsInOperation, and contactRole for a business applicant", () => {
    const result = consultationFormSchema.safeParse(
      validBusinessSubmission({
        businessName: "",
        industry: "",
        businessType: "",
        employeeBand: "",
        turnoverBand: "",
        yearsInOperation: "",
        contactRole: "",
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toEqual(
        expect.arrayContaining([
          "businessName",
          "industry",
          "businessType",
          "employeeBand",
          "turnoverBand",
          "yearsInOperation",
          "contactRole",
        ]),
      );
    }
  });

  it("does not require those business-only fields for an individual applicant", () => {
    const result = consultationFormSchema.safeParse(validIndividualSubmission());
    expect(result.success).toBe(true);
  });
});

describe("consultationFormSchema - applicant type vs. product/cover consistency", () => {
  it("rejects business_insurance selected on an individual application", () => {
    const result = consultationFormSchema.safeParse(
      validIndividualSubmission({ insuranceProducts: ["business_insurance"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a personal product (e.g. motor_insurance) selected on a business application", () => {
    const result = consultationFormSchema.safeParse(
      validBusinessSubmission({ insuranceProducts: ["motor_insurance"] }),
    );
    expect(result.success).toBe(false);
  });

  it("always allows general_insurance_review regardless of applicant type", () => {
    const business = consultationFormSchema.safeParse(
      validBusinessSubmission({ insuranceProducts: ["business_insurance", "general_insurance_review"] }),
    );
    const individual = consultationFormSchema.safeParse(
      validIndividualSubmission({ insuranceProducts: ["motor_insurance", "general_insurance_review"] }),
    );
    expect(business.success).toBe(true);
    expect(individual.success).toBe(true);
  });

  it("rejects business cover interests selected on an individual application", () => {
    const result = consultationFormSchema.safeParse(
      validIndividualSubmission({ businessCoverInterests: ["public_liability"] }),
    );
    expect(result.success).toBe(false);
  });

  it("requires at least one insurance product", () => {
    const result = consultationFormSchema.safeParse(validIndividualSubmission({ insuranceProducts: [] }));
    expect(result.success).toBe(false);
  });
});

describe("consultationFormSchema - field-level validation", () => {
  it("rejects an invalid email address", () => {
    const result = consultationFormSchema.safeParse(validIndividualSubmission({ contactEmail: "not-an-email" }));
    expect(result.success).toBe(false);
  });

  it("rejects a mobile number that is too short or has invalid characters", () => {
    expect(consultationFormSchema.safeParse(validIndividualSubmission({ contactMobile: "123" })).success).toBe(false);
    expect(
      consultationFormSchema.safeParse(validIndividualSubmission({ contactMobile: "not-a-number!" })).success,
    ).toBe(false);
  });

  it("accepts common South African mobile number formats", () => {
    for (const mobile of ["0821234567", "+27 82 123 4567", "(082) 123-4567"]) {
      expect(consultationFormSchema.safeParse(validIndividualSubmission({ contactMobile: mobile })).success).toBe(true);
    }
  });

  it("rejects a postal code that is not exactly 4 digits, but allows an empty one", () => {
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ postalCode: "12345" })).success).toBe(false);
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ postalCode: "abcd" })).success).toBe(false);
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ postalCode: "2196" })).success).toBe(true);
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ postalCode: "" })).success).toBe(true);
  });

  it("rejects a malformed website address, but allows an empty one", () => {
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ website: "not a url" })).success).toBe(false);
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ website: "https://acme.co.za" })).success).toBe(
      true,
    );
    expect(consultationFormSchema.safeParse(validBusinessSubmission({ website: "" })).success).toBe(true);
  });

  it("requires a province and a city", () => {
    expect(consultationFormSchema.safeParse(validIndividualSubmission({ province: "" })).success).toBe(false);
    expect(consultationFormSchema.safeParse(validIndividualSubmission({ city: "" })).success).toBe(false);
  });

  it("requires a preferred contact channel", () => {
    const result = consultationFormSchema.safeParse(
      validIndividualSubmission({ preferredContactChannel: undefined }),
    );
    expect(result.success).toBe(false);
  });
});
