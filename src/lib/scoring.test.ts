import { describe, expect, it } from "vitest";
import { scoreLead, scoreOpportunity, type ScoringInput } from "./scoring";

// A minimal, fully "empty" scoring input - every test below overrides only
// what it needs to, so each test's intent (what's being varied) stays
// obvious rather than buried in an unrelated field.
function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    hasCompleteContactInfo: false,
    hasWebsite: false,
    insuranceProductCount: 0,
    renewalWithinDays: null,
    financialYearEndWithinDays: null,
    highPriorityIndustry: false,
    highIntentCampaignSource: false,
    isDirectReferral: false,
    isDuplicate: false,
    doNotContact: false,
    hasInvalidContactDetails: false,
    ...overrides,
  };
}

describe("scoreLead", () => {
  it("scores a lead with nothing going for it as 0, low priority", () => {
    const result = scoreLead(baseInput());
    expect(result.score).toBe(0);
    expect(result.band).toBe("low_priority");
    expect(result.explanation).toContain("limited information");
  });

  it("awards points additively and explains each contributing reason", () => {
    const result = scoreLead(
      baseInput({
        hasCompleteContactInfo: true, // +15
        hasWebsite: true, // +5
        insuranceProductCount: 2, // +15
        renewalWithinDays: 30, // +15
        financialYearEndWithinDays: 45, // +10
        highPriorityIndustry: true, // +8
        employeeBand: "200+", // +8
        turnoverBand: "R50 million+", // +8
        highIntentCampaignSource: true, // +10
        isDirectReferral: true, // +6
      }),
    );
    // 15+5+15+15+10+8+8+8+10+6 = 100
    expect(result.score).toBe(100);
    expect(result.band).toBe("hot");
    expect(result.explanation).toContain("complete contact information");
    expect(result.explanation).toContain("multiple insurance products");
    expect(result.explanation).toContain("renewal date within 30 days");
    expect(result.explanation).toContain("approaching financial year-end");
    expect(result.explanation).toContain("high-priority industry");
    expect(result.explanation).toContain("larger employee headcount");
    expect(result.explanation).toContain("higher annual turnover band");
    expect(result.explanation).toContain("high-intent campaign source");
    expect(result.explanation).toContain("direct referral");
  });

  it("awards partial credit for a single insurance product, not the multi-product bonus", () => {
    const one = scoreLead(baseInput({ insuranceProductCount: 1 }));
    const two = scoreLead(baseInput({ insuranceProductCount: 2 }));
    expect(one.score).toBe(8);
    expect(two.score).toBe(15);
  });

  it("only counts a renewal within 45 days, not a distant one", () => {
    const soon = scoreLead(baseInput({ renewalWithinDays: 45 }));
    const far = scoreLead(baseInput({ renewalWithinDays: 90 }));
    expect(soon.score).toBe(15);
    expect(far.score).toBe(0);
  });

  it("gives mid-band employee credit for 21-50 without the full large-headcount bonus", () => {
    const mid = scoreLead(baseInput({ employeeBand: "21-50" }));
    const large = scoreLead(baseInput({ employeeBand: "51-200" }));
    expect(mid.score).toBe(4);
    expect(large.score).toBe(8);
  });

  it("penalises a duplicate submission without letting the score go negative", () => {
    const result = scoreLead(baseInput({ isDuplicate: true }));
    expect(result.score).toBe(0);
  });

  it("penalises invalid contact details but does not let strong signals mask it entirely", () => {
    const result = scoreLead(
      baseInput({ hasCompleteContactInfo: true, insuranceProductCount: 2, hasInvalidContactDetails: true }),
    );
    // 15 + 15 - 15 = 15
    expect(result.score).toBe(15);
  });

  it("forces score to 0 and band to low_priority for Do Not Contact, regardless of other signals", () => {
    const result = scoreLead(
      baseInput({
        hasCompleteContactInfo: true,
        insuranceProductCount: 2,
        highIntentCampaignSource: true,
        doNotContact: true,
      }),
    );
    expect(result.score).toBe(0);
    expect(result.band).toBe("low_priority");
  });

  it("never exceeds 100 even if every bonus somehow stacked", () => {
    const result = scoreLead(
      baseInput({
        hasCompleteContactInfo: true,
        hasWebsite: true,
        insuranceProductCount: 5,
        renewalWithinDays: 1,
        financialYearEndWithinDays: 1,
        highPriorityIndustry: true,
        employeeBand: "200+",
        turnoverBand: "R50 million+",
        highIntentCampaignSource: true,
        isDirectReferral: true,
      }),
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("bands scores at each threshold using exact, hand-computed point totals", () => {
    // low_priority: hasWebsite alone = 5
    expect(scoreLead(baseInput({ hasWebsite: true })).score).toBe(5);
    expect(scoreLead(baseInput({ hasWebsite: true })).band).toBe("low_priority");

    // nurture: hasCompleteContactInfo (15) + hasWebsite (5) = 20, the
    // nurture band's own lower boundary.
    const nurture = scoreLead(baseInput({ hasCompleteContactInfo: true, hasWebsite: true }));
    expect(nurture.score).toBe(20);
    expect(nurture.band).toBe("nurture");

    // warm: hasCompleteContactInfo (15) + insuranceProductCount=2 (15) +
    // renewalWithinDays<=45 (15) = 45, the warm band's own lower boundary.
    const warm = scoreLead(
      baseInput({ hasCompleteContactInfo: true, insuranceProductCount: 2, renewalWithinDays: 30 }),
    );
    expect(warm.score).toBe(45);
    expect(warm.band).toBe("warm");

    // hot: the warm combination above plus financialYearEndWithinDays<=60
    // (10) + highPriorityIndustry (8) + isDirectReferral (6) = 69, then
    // hasWebsite (5) tips it to 74, past the hot band's 70 boundary.
    const hot = scoreLead(
      baseInput({
        hasCompleteContactInfo: true,
        insuranceProductCount: 2,
        renewalWithinDays: 30,
        financialYearEndWithinDays: 45,
        highPriorityIndustry: true,
        isDirectReferral: true,
        hasWebsite: true,
      }),
    );
    expect(hot.score).toBe(74);
    expect(hot.band).toBe("hot");
  });
});

describe("scoreOpportunity", () => {
  it("scores volume on a scale relative to the minimum display threshold", () => {
    const atMinimum = scoreOpportunity({ leadVolume: 10, minLeadThreshold: 10, growthRate: null, conversionRate: null });
    const strong = scoreOpportunity({ leadVolume: 20, minLeadThreshold: 10, growthRate: null, conversionRate: null });
    const high = scoreOpportunity({ leadVolume: 30, minLeadThreshold: 10, growthRate: null, conversionRate: null });
    expect(atMinimum.score).toBeLessThan(strong.score);
    expect(strong.score).toBeLessThan(high.score);
  });

  it("treats null growth/conversion as neutral, not as a fabricated zero", () => {
    const withNulls = scoreOpportunity({ leadVolume: 10, minLeadThreshold: 10, growthRate: null, conversionRate: null });
    const withZeroGrowthAndLowConversion = scoreOpportunity({
      leadVolume: 10,
      minLeadThreshold: 10,
      growthRate: -0.5,
      conversionRate: 0,
    });
    expect(withNulls.score).toBeGreaterThan(withZeroGrowthAndLowConversion.score);
    expect(withNulls.explanation).toContain("does not yet have enough prior-period history");
    expect(withNulls.explanation).toContain("no won or lost leads yet");
  });

  it("rewards strong growth and conversion with a higher score", () => {
    const weak = scoreOpportunity({ leadVolume: 10, minLeadThreshold: 10, growthRate: -0.2, conversionRate: 0.05 });
    const strong = scoreOpportunity({ leadVolume: 10, minLeadThreshold: 10, growthRate: 0.3, conversionRate: 0.5 });
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("clamps the score between 0 and 100", () => {
    const result = scoreOpportunity({ leadVolume: 1000, minLeadThreshold: 10, growthRate: 1, conversionRate: 1 });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("uses the provided subject label in the explanation, defaulting to 'area'", () => {
    const area = scoreOpportunity({ leadVolume: 10, minLeadThreshold: 10, growthRate: null, conversionRate: null });
    const industry = scoreOpportunity({
      leadVolume: 10,
      minLeadThreshold: 10,
      growthRate: null,
      conversionRate: null,
      subjectLabel: "industry",
    });
    expect(area.explanation).toContain("this area");
    expect(industry.explanation).toContain("this industry");
  });
});
