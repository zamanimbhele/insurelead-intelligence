import { describe, expect, it } from "vitest";
import {
  computeConversionRate,
  computeGrowthRate,
  daysUntilNextOccurrenceOfMonth,
  mostFrequent,
  MONTH_NAMES,
} from "./aggregation-utils";
import { HOTSPOT_RECENT_WINDOW_DAYS, HOTSPOT_PRIOR_WINDOW_DAYS } from "./constants";
import type { Lead } from "./types";

// Minimal lead fixtures - only the fields these pure aggregation helpers
// actually read (createdAt, status) need to be set; every other required
// Lead field gets an innocuous placeholder so the object type-checks.
function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_test",
    applicantType: "business",
    province: "Gauteng",
    city: "Johannesburg",
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

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("mostFrequent", () => {
  it("returns the most common defined value", () => {
    expect(mostFrequent(["a", "b", "a", "a", "b"])).toBe("a");
  });

  it("ignores undefined entries", () => {
    expect(mostFrequent([undefined, "b", undefined, "b"])).toBe("b");
  });

  it("returns undefined for an empty or all-undefined list", () => {
    expect(mostFrequent([])).toBeUndefined();
    expect(mostFrequent([undefined, undefined])).toBeUndefined();
  });
});

describe("computeGrowthRate", () => {
  it("returns null when there is no prior-period history, never a fabricated 0%", () => {
    const leads = [makeLead({ createdAt: daysAgoIso(10) }), makeLead({ createdAt: daysAgoIso(20) })];
    expect(computeGrowthRate(leads)).toBeNull();
  });

  it("computes a positive growth rate when recent volume exceeds the prior period", () => {
    const leads = [
      // 2 in the prior window
      makeLead({ createdAt: daysAgoIso(HOTSPOT_RECENT_WINDOW_DAYS + 5) }),
      makeLead({ createdAt: daysAgoIso(HOTSPOT_RECENT_WINDOW_DAYS + 10) }),
      // 4 in the recent window
      makeLead({ createdAt: daysAgoIso(1) }),
      makeLead({ createdAt: daysAgoIso(2) }),
      makeLead({ createdAt: daysAgoIso(3) }),
      makeLead({ createdAt: daysAgoIso(4) }),
    ];
    // (4 - 2) / 2 = 1.0
    expect(computeGrowthRate(leads)).toBeCloseTo(1.0, 5);
  });

  it("computes a negative growth rate when recent volume is lower than the prior period", () => {
    const leads = [
      makeLead({ createdAt: daysAgoIso(1) }),
      makeLead({ createdAt: daysAgoIso(HOTSPOT_RECENT_WINDOW_DAYS + 5) }),
      makeLead({ createdAt: daysAgoIso(HOTSPOT_RECENT_WINDOW_DAYS + 10) }),
      makeLead({ createdAt: daysAgoIso(HOTSPOT_RECENT_WINDOW_DAYS + 15) }),
    ];
    // (1 - 3) / 3 = -0.666...
    expect(computeGrowthRate(leads)).toBeCloseTo(-2 / 3, 5);
  });

  it("ignores leads older than both windows combined", () => {
    const leads = [
      makeLead({ createdAt: daysAgoIso(HOTSPOT_RECENT_WINDOW_DAYS + 5) }), // 1 prior
      makeLead({ createdAt: daysAgoIso(HOTSPOT_RECENT_WINDOW_DAYS + HOTSPOT_PRIOR_WINDOW_DAYS + 100) }), // too old
    ];
    expect(computeGrowthRate(leads)).toBeCloseTo((0 - 1) / 1, 5);
  });
});

describe("computeConversionRate", () => {
  it("returns null when nothing has closed yet, never a fabricated 0%", () => {
    const leads = [makeLead({ status: "new" }), makeLead({ status: "qualified" })];
    expect(computeConversionRate(leads)).toBeNull();
  });

  it("computes won / (won + lost), ignoring leads that have not closed", () => {
    const leads = [
      makeLead({ status: "won" }),
      makeLead({ status: "won" }),
      makeLead({ status: "lost" }),
      makeLead({ status: "new" }),
      makeLead({ status: "nurture" }),
    ];
    expect(computeConversionRate(leads)).toBeCloseTo(2 / 3, 5);
  });

  it("returns 0 when everything closed has been lost", () => {
    const leads = [makeLead({ status: "lost" }), makeLead({ status: "lost" })];
    expect(computeConversionRate(leads)).toBe(0);
  });

  it("returns 1 when everything closed has been won", () => {
    const leads = [makeLead({ status: "won" }), makeLead({ status: "won" })];
    expect(computeConversionRate(leads)).toBe(1);
  });
});

describe("daysUntilNextOccurrenceOfMonth", () => {
  it("returns 0 days when 'from' is the first of the target month itself", () => {
    const from = new Date(2026, 5, 1); // 1 June 2026
    expect(daysUntilNextOccurrenceOfMonth("June", from)).toBe(0);
  });

  it("returns a negative day count once the target month has already started this year", () => {
    // Matches the function's own documented behaviour: it always targets
    // the 1st of the month, so partway through the current month that's
    // a date in the past, not a future "due in N days" figure - callers
    // (daysUntilNextOccurrenceOfMonth's own callers in industries.ts/
    // fye-planner.ts) treat that as "due now", not as an error.
    const from = new Date(2026, 5, 15); // 15 June 2026
    expect(daysUntilNextOccurrenceOfMonth("June", from)).toBe(-14);
  });

  it("is case-insensitive and trims whitespace", () => {
    const from = new Date(2026, 5, 1);
    expect(daysUntilNextOccurrenceOfMonth(" june ", from)).toBe(0);
    expect(daysUntilNextOccurrenceOfMonth("JUNE", from)).toBe(0);
  });

  it("counts forward within the same calendar year for a later month", () => {
    const from = new Date(2026, 0, 1); // 1 January 2026
    // 1 March 2026 is 59 days after 1 January 2026 (2026 is not a leap year)
    expect(daysUntilNextOccurrenceOfMonth("March", from)).toBe(59);
  });

  it("rolls over to next year for a month that has already passed", () => {
    const from = new Date(2026, 5, 15); // 15 June 2026
    const result = daysUntilNextOccurrenceOfMonth("January", from);
    // 1 January 2027 is in the future relative to 15 June 2026 - should be
    // roughly 200 days out, and in particular NOT negative.
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  it("returns null for an unparseable month name instead of throwing", () => {
    expect(daysUntilNextOccurrenceOfMonth("Not A Month")).toBeNull();
    expect(daysUntilNextOccurrenceOfMonth("")).toBeNull();
  });

  it("recognises all twelve month names", () => {
    const from = new Date(2026, 0, 1);
    for (const month of MONTH_NAMES) {
      expect(daysUntilNextOccurrenceOfMonth(month, from)).not.toBeNull();
    }
  });
});
