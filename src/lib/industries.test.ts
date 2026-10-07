import { describe, expect, it } from "vitest";
import { computeIndustryOpportunities } from "./industries";
import type { Lead } from "./types";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: `lead_${Math.random().toString(36).slice(2, 8)}`,
    applicantType: "business",
    province: "Gauteng",
    city: "Johannesburg",
    industry: "Retail",
    insuranceProducts: ["business_insurance"],
    currentInsuranceStatus: "unsure",
    preferredContactChannel: "email",
    contactFullName: "Test Contact",
    contactEmail: "test@example.com",
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

describe("computeIndustryOpportunities", () => {
  it("excludes leads with no industry set (individual applicants)", () => {
    const leads = [
      makeLead({ industry: undefined }),
      makeLead({ industry: undefined }),
      makeLead({ industry: "Retail" }),
      makeLead({ industry: "Retail" }),
    ];
    const result = computeIndustryOpportunities(leads, 2);
    expect(result).toHaveLength(1);
    expect(result[0].industry).toBe("Retail");
  });

  it("suppresses an industry below the minimum lead threshold", () => {
    const leads = [
      makeLead({ industry: "Retail" }),
      makeLead({ industry: "Retail" }),
      makeLead({ industry: "Mining" }), // alone - below threshold
    ];
    const result = computeIndustryOpportunities(leads, 2);
    const industries = result.map((r) => r.industry);
    expect(industries).toContain("Retail");
    expect(industries).not.toContain("Mining");
  });

  it("counts renewal urgency as N of M, honestly reporting zero captured renewal dates", () => {
    const noRenewalData = computeIndustryOpportunities(
      [makeLead({ industry: "Retail" }), makeLead({ industry: "Retail" })],
      2,
    );
    expect(noRenewalData[0].renewalDataCount).toBe(0);
    expect(noRenewalData[0].renewingSoonCount).toBe(0);

    const soon = new Date();
    soon.setDate(soon.getDate() + 10);
    const soonMonth = soon.toLocaleString("en-US", { month: "long" });
    const far = new Date();
    far.setMonth(far.getMonth() + 7);
    const farMonth = far.toLocaleString("en-US", { month: "long" });

    const withRenewals = computeIndustryOpportunities(
      [
        makeLead({ industry: "Retail", renewalMonth: soonMonth }),
        makeLead({ industry: "Retail", renewalMonth: farMonth }),
      ],
      2,
    );
    expect(withRenewals[0].renewalDataCount).toBe(2);
    expect(withRenewals[0].renewingSoonCount).toBe(1);
  });

  it("flags 'needs marketing attention' for low conversion, but not for thin data", () => {
    // 1 won / 7 closed ≈ 14% - below the 15% conversion threshold that
    // triggers the flag.
    const struggling = computeIndustryOpportunities(
      [
        makeLead({ industry: "Struggling", status: "lost" }),
        makeLead({ industry: "Struggling", status: "lost" }),
        makeLead({ industry: "Struggling", status: "lost" }),
        makeLead({ industry: "Struggling", status: "lost" }),
        makeLead({ industry: "Struggling", status: "lost" }),
        makeLead({ industry: "Struggling", status: "lost" }),
        makeLead({ industry: "Struggling", status: "won" }),
      ],
      2,
    )[0];
    expect(struggling.needsMarketingAttention).toBe(true);
    expect(struggling.attentionReason).toContain("converting only");

    const thinData = computeIndustryOpportunities(
      [makeLead({ industry: "New Industry" }), makeLead({ industry: "New Industry" })],
      2,
    )[0];
    expect(thinData.needsMarketingAttention).toBe(false);
    expect(thinData.attentionReason).toBeUndefined();
  });

  it("sorts industries by opportunity score, highest first", () => {
    const leads = [
      makeLead({ industry: "Weak" }),
      makeLead({ industry: "Weak" }),
      makeLead({ industry: "Strong", status: "won" }),
      makeLead({ industry: "Strong", status: "won" }),
      makeLead({ industry: "Strong", status: "won" }),
      makeLead({ industry: "Strong", status: "won" }),
    ];
    const result = computeIndustryOpportunities(leads, 2);
    expect(result[0].industry).toBe("Strong");
    expect(result[0].opportunityScore).toBeGreaterThanOrEqual(result[1].opportunityScore);
  });
});
