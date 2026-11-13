import { describe, expect, it } from "vitest";
import { FALLBACK_CATALOGUE } from "../products";
import { createStaffLeadSchema, normaliseMobile } from "./staffLeadSchema";

const valid = {
  applicantType: "individual",
  contactFullName: "Test Person",
  contactMobile: "082 555 0100",
  preferredContactChannel: "phone",
  province: "Gauteng",
  city: "Johannesburg",
  insuranceProducts: ["life_insurance"],
  contactBasis: "direct_enquiry",
  contactPermissionConfirmed: true,
};

const schema = createStaffLeadSchema(FALLBACK_CATALOGUE);
const messages = (input: unknown, using = schema) => {
  const result = using.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("createStaffLeadSchema", () => {
  it("accepts a phone lead with no email and fills the defaults", () => {
    const result = schema.parse(valid);
    expect(result).toMatchObject({ contactEmail: "", currentInsuranceStatus: "unsure", allowDuplicate: false });
  });

  it("requires a statement that the person agreed to be contacted", () => {
    expect(messages({ ...valid, contactPermissionConfirmed: false })).toContain("Confirm that this person agreed to be contacted");
    expect(messages({ ...valid, contactBasis: "bought_list" })).toContain("Say how this person agreed to be contacted");
    expect(messages({ ...valid, contactBasis: "other" })).toContain("Describe how this person agreed to be contacted");
    expect(messages({ ...valid, contactBasis: "other", contactBasisNote: "Asked via a family member" })).toEqual([]);
  });

  it("requires a contact detail that matches the preferred channel", () => {
    expect(messages({ ...valid, contactMobile: "" })).toContain("Give an email address or a mobile number");
    expect(messages({ ...valid, preferredContactChannel: "email" })).toContain("An email address is needed to contact them by email");
    expect(messages({ ...valid, contactMobile: "", contactEmail: "person@example.co.za", preferredContactChannel: "whatsapp" }))
      .toContain("A mobile number is needed to contact them by phone or WhatsApp");
    expect(messages({ ...valid, contactEmail: "not-an-email" })).toContain("Enter a valid email address");
    expect(messages({ ...valid, contactMobile: "12345" })).toContain("Enter a valid mobile number");
  });

  it("checks products against the applicant type and the practice's authorisation", () => {
    expect(messages({ ...valid, insuranceProducts: ["business_insurance"] })).toContain("One or more products do not match the applicant type");
    expect(messages({ ...valid, insuranceProducts: [] })).toContain("Select at least one product");
    const limited = createStaffLeadSchema(FALLBACK_CATALOGUE, ["funeral_cover"]);
    expect(messages(valid, limited)).toContain("Your practice is not authorised for one or more of these products");
    expect(messages({ ...valid, insuranceProducts: ["funeral_cover"] }, limited)).toEqual([]);
  });

  it("requires a business name for a business lead", () => {
    const business = { ...valid, applicantType: "business", insuranceProducts: ["business_insurance"] };
    expect(messages(business)).toContain("Business name is required for a business lead");
    expect(messages({ ...business, businessName: "Example Traders" })).toEqual([]);
  });

  it("rejects fields it does not know, such as an organisation or a score", () => {
    expect(schema.safeParse({ ...valid, organisationId: "another-organisation" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, score: 100 }).success).toBe(false);
  });
});

describe("normaliseMobile", () => {
  it("treats local and +27 forms as the same number", () => {
    expect(normaliseMobile("+27 82 555 0100")).toBe("0825550100");
    expect(normaliseMobile("082-555-0100")).toBe("0825550100");
    expect(normaliseMobile(undefined)).toBe("");
  });
});
