import { describe, expect, it } from "vitest";
import { computeFyeCalendar, computeFyeMonthBreakdown, leadsForFyeFollowUp } from "./fye-planner";
import { MONTH_NAMES } from "./aggregation-utils";
import type { FinancialYearCampaignPlan, Lead } from "./types";

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

function makePlan(overrides: Partial<FinancialYearCampaignPlan> = {}): FinancialYearCampaignPlan {
  return {
    id: `plan_${Math.random().toString(36).slice(2, 8)}`,
    fyeMonth: "March",
    plannedContactMonth: "January",
    title: "Test plan",
    status: "planned",
    createdBy: "demo_platform_admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeFyeCalendar", () => {
  it("always returns exactly 12 rows, one per calendar month, even at zero leads", () => {
    const calendar = computeFyeCalendar([], []);
    expect(calendar).toHaveLength(12);
    expect(calendar.map((entry) => entry.month)).toEqual(MONTH_NAMES);
    expect(calendar.every((entry) => entry.leadVolume === 0)).toBe(true);
  });

  it("counts leads into their declared financial-year-end month, never assuming March", () => {
    const calendar = computeFyeCalendar(
      [
        makeLead({ financialYearEndMonth: "June" }),
        makeLead({ financialYearEndMonth: "June" }),
        makeLead({ financialYearEndMonth: "November" }),
      ],
      [],
    );
    const june = calendar.find((entry) => entry.month === "June")!;
    const november = calendar.find((entry) => entry.month === "November")!;
    const march = calendar.find((entry) => entry.month === "March")!;
    expect(june.leadVolume).toBe(2);
    expect(november.leadVolume).toBe(1);
    expect(march.leadVolume).toBe(0);
  });

  it("excludes cancelled plans from a month's plan list", () => {
    const calendar = computeFyeCalendar(
      [],
      [
        makePlan({ fyeMonth: "March", status: "planned" }),
        makePlan({ fyeMonth: "March", status: "cancelled" }),
        makePlan({ fyeMonth: "March", status: "active" }),
      ],
    );
    const march = calendar.find((entry) => entry.month === "March")!;
    expect(march.plans).toHaveLength(2);
    expect(march.plans.every((plan) => plan.status !== "cancelled")).toBe(true);
  });
});

describe("computeFyeMonthBreakdown", () => {
  it("summarises totals, conversion rate, and top industry/province for one month", () => {
    const breakdown = computeFyeMonthBreakdown(
      [
        makeLead({ financialYearEndMonth: "June", industry: "Retail", province: "Gauteng", status: "won" }),
        makeLead({ financialYearEndMonth: "June", industry: "Retail", province: "Gauteng", status: "lost" }),
        makeLead({ financialYearEndMonth: "June", industry: "Mining", province: "Western Cape" }),
        makeLead({ financialYearEndMonth: "November", industry: "Retail", province: "Gauteng" }),
      ],
      "June",
    );
    expect(breakdown.totalLeads).toBe(3);
    expect(breakdown.conversionRate).toBeCloseTo(0.5, 5);
    expect(breakdown.byIndustry[0]).toEqual({ label: "Retail", leadVolume: 2 });
    expect(breakdown.byProvince[0]).toEqual({ label: "Gauteng", leadVolume: 2 });
  });

  it("returns a null conversion rate and empty breakdowns for a month with no leads", () => {
    const breakdown = computeFyeMonthBreakdown([makeLead({ financialYearEndMonth: "June" })], "December");
    expect(breakdown.totalLeads).toBe(0);
    expect(breakdown.conversionRate).toBeNull();
    expect(breakdown.byIndustry).toEqual([]);
    expect(breakdown.byProvince).toEqual([]);
    expect(breakdown.topInsuranceNeed).toBeUndefined();
  });
});

describe("leadsForFyeFollowUp", () => {
  it("includes only leads in the given month that are not do-not-contact or redacted", () => {
    const leads = [
      makeLead({ financialYearEndMonth: "June", doNotContact: false }),
      makeLead({ financialYearEndMonth: "June", doNotContact: true }),
      makeLead({ financialYearEndMonth: "June", deletedAt: new Date().toISOString() }),
      makeLead({ financialYearEndMonth: "November", doNotContact: false }),
    ];
    const eligible = leadsForFyeFollowUp(leads, "June");
    expect(eligible).toHaveLength(1);
    expect(eligible[0].doNotContact).toBe(false);
    expect(eligible[0].deletedAt).toBeUndefined();
  });
});
