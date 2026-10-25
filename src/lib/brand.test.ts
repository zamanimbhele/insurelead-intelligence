import { describe, expect, it } from "vitest";
import { campaignSenderName, isPlaceholderWording, missingDisclosureDetails, normaliseBrand, renderDisclosure } from "./brand";

const TEMPLATE = "PLACEHOLDER - confirm this wording.\n\n{{advisor_name}} is a {{capacity}} of {{fsp_name}}, an authorised financial services provider (FSP {{fsp_number}}).\nNot advice.";
const BRAND = { mode: "personal", displayName: "Lerato Ndlovu", capacity: "representative", fspName: "Example Life FSP", fspNumber: "12345" } as const;

describe("representative disclosure", () => {
  it("fills in the details and leaves out the placeholder note", () => {
    expect(renderDisclosure(TEMPLATE, BRAND)).toBe(
      "Lerato Ndlovu is a representative of Example Life FSP, an authorised financial services provider (FSP 12345). Not advice.",
    );
    expect(isPlaceholderWording(TEMPLATE)).toBe(true);
    expect(isPlaceholderWording("Confirmed wording for {{advisor_name}}.")).toBe(false);
  });

  it("is not produced until every detail is present", () => {
    expect(renderDisclosure(TEMPLATE, { ...BRAND, fspNumber: " " })).toBeUndefined();
    expect(missingDisclosureDetails({ mode: "personal", displayName: "Lerato" })).toEqual(["your capacity", "the FSP name", "the FSP number"]);
  });

  it("uses the advisor's name only for a personal brand", () => {
    expect(campaignSenderName("Lerato Ndlovu Financial Planning", BRAND)).toBe("Lerato Ndlovu");
    expect(campaignSenderName("Gauteng Commercial", { mode: "company" })).toBe("Gauteng Commercial");
  });

  it("reads database rows safely", () => {
    expect(normaliseBrand({ brand_mode: "personal", disclosure_capacity: "director" })).toEqual({
      mode: "personal", displayName: undefined, capacity: undefined, fspName: undefined, fspNumber: undefined,
    });
    expect(normaliseBrand(null).mode).toBe("company");
  });
});

describe("campaign content and checks for a personal brand", async () => {
  const { generateCampaignCopy, validateCampaign } = await import("./campaign-policy");
  const { brandedCopyInput } = await import("./brand");
  const disclosure = renderDisclosure(TEMPLATE, BRAND)!;
  const buyer = {
    id: "org1", organisationName: "Lerato Ndlovu Financial Planning", status: "active", onboardingStatus: "approved",
    acceptsCampaigns: true, insuranceProducts: ["life_insurance"], authorisedProducts: ["life_insurance"],
    brand: BRAND, requiredDisclosure: disclosure, disclosureIsPlaceholder: true,
  };
  const campaign = { organisationId: "org1", objective: "awareness", insuranceProducts: ["life_insurance"], currentContentVersion: 1, contactBasis: "marketing_consent" };
  const copy = generateCampaignCopy(brandedCopyInput(buyer, {
    campaign: campaign as never, keyMessage: "Is your family protected if something happens to you?",
    callToActionLabel: "Book a review", callToActionUrl: "https://example.co.za/review",
  }));

  it("signs with the advisor's name and carries the disclosure in both versions", () => {
    expect(copy.textBody).toContain("Sent by Lerato Ndlovu.");
    expect(copy.textBody).toContain(disclosure);
    expect(copy.htmlBody).toContain('data-disclosure="representative"');
    expect(copy.htmlBody).toContain("FSP 12345");
    expect(copy.textBody).not.toContain("PLACEHOLDER");
  });

  const issues = (content: object | undefined, overrides: object = {}) => validateCampaign({
    campaign: campaign as never, buyer: { ...buyer, ...overrides } as never, sendingIdentity: undefined,
    content: content as never, audience: [],
  }).map((issue) => `${issue.severity}:${issue.code}`);

  it("accepts content with the current disclosure, warning while the wording is a placeholder", () => {
    const result = issues({ ...copy, version: 1 });
    expect(result).toContain("warning:disclosure_placeholder");
    expect(result).not.toContain("error:disclosure_outdated");
  });

  it("blocks content whose disclosure is out of date, and missing details", () => {
    const changed = renderDisclosure(TEMPLATE, { ...BRAND, fspNumber: "99999" });
    expect(issues({ ...copy, version: 1 }, { requiredDisclosure: changed })).toContain("error:disclosure_outdated");
    expect(issues({ ...copy, version: 1 }, { brand: { ...BRAND, fspName: "" }, requiredDisclosure: undefined })).toContain("error:brand_details_missing");
  });

  it("refuses to generate content until the details are complete", () => {
    expect(() => brandedCopyInput({ ...buyer, requiredDisclosure: undefined, brand: { mode: "personal" } }, {}))
      .toThrow("Add your name, your capacity, the FSP name, the FSP number under branding before generating content");
  });
});
