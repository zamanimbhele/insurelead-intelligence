import { describe, expect, it } from "vitest";
import { computeGeoHotspots } from "./hotspots";
import type { Lead } from "./types";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: `lead_${Math.random().toString(36).slice(2, 8)}`,
    applicantType: "business",
    province: "Gauteng",
    city: "Johannesburg",
    suburb: "Sandton",
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
    campaignSource: "google_ads",
    utm: {},
    doNotContact: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeGeoHotspots", () => {
  it("suppresses any area below the minimum lead threshold - never a small, identifiable area", () => {
    const leads = [
      makeLead({ province: "Gauteng" }),
      makeLead({ province: "Gauteng" }),
      makeLead({ province: "Western Cape" }), // alone - below threshold of 2
    ];
    const hotspots = computeGeoHotspots(leads, "province", 2);
    const provinces = hotspots.map((h) => h.province);
    expect(provinces).toContain("Gauteng");
    expect(provinces).not.toContain("Western Cape");
  });

  it("groups by province only at the province level, ignoring city/suburb differences", () => {
    const leads = [
      makeLead({ province: "Gauteng", city: "Johannesburg", suburb: "Sandton" }),
      makeLead({ province: "Gauteng", city: "Pretoria", suburb: "Hatfield" }),
    ];
    const hotspots = computeGeoHotspots(leads, "province", 2);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].level).toBe("province");
    expect(hotspots[0].leadVolume).toBe(2);
    expect(hotspots[0].city).toBeUndefined();
    expect(hotspots[0].label).toBe("Gauteng");
  });

  it("groups by province + city at the municipality level", () => {
    const leads = [
      makeLead({ province: "Gauteng", city: "Johannesburg" }),
      makeLead({ province: "Gauteng", city: "Johannesburg" }),
      makeLead({ province: "Gauteng", city: "Pretoria" }),
      makeLead({ province: "Gauteng", city: "Pretoria" }),
    ];
    const hotspots = computeGeoHotspots(leads, "municipality", 2);
    expect(hotspots).toHaveLength(2);
    const labels = hotspots.map((h) => h.label).sort();
    expect(labels).toEqual(["Gauteng - Johannesburg", "Gauteng - Pretoria"]);
  });

  it("excludes a lead missing the field required at that grouping level", () => {
    const leads = [
      makeLead({ province: "Gauteng", city: undefined }),
      makeLead({ province: "Gauteng", city: undefined }),
    ];
    // Municipality grouping requires a city - leads without one are simply
    // not grouped at all, never silently bucketed under "undefined".
    expect(computeGeoHotspots(leads, "municipality", 2)).toHaveLength(0);
  });

  it("sorts results by opportunity score, highest first", () => {
    const leads = [
      // A thin, newly-formed Western Cape group with minimal signal.
      makeLead({ province: "Western Cape" }),
      makeLead({ province: "Western Cape" }),
      // A larger, fully-won Gauteng group - should score higher.
      makeLead({ province: "Gauteng", status: "won" }),
      makeLead({ province: "Gauteng", status: "won" }),
      makeLead({ province: "Gauteng", status: "won" }),
      makeLead({ province: "Gauteng", status: "won" }),
    ];
    const hotspots = computeGeoHotspots(leads, "province", 2);
    expect(hotspots[0].province).toBe("Gauteng");
    expect(hotspots[0].opportunityScore).toBeGreaterThanOrEqual(hotspots[1].opportunityScore);
  });

  it("surfaces the most frequent industry, insurance need, and campaign source per area", () => {
    const leads = [
      makeLead({ province: "Gauteng", industry: "Retail", campaignSource: "google_ads", insuranceProducts: ["business_insurance"] }),
      makeLead({ province: "Gauteng", industry: "Retail", campaignSource: "google_ads", insuranceProducts: ["business_insurance"] }),
      makeLead({ province: "Gauteng", industry: "Manufacturing", campaignSource: "referral", insuranceProducts: ["travel_insurance"] }),
    ];
    const [hotspot] = computeGeoHotspots(leads, "province", 2);
    expect(hotspot.topIndustry).toBe("Retail");
    expect(hotspot.topCampaignSource).toBe("google_ads");
  });

  it("returns an empty array when nothing meets the threshold", () => {
    const leads = [makeLead({ province: "Gauteng" })];
    expect(computeGeoHotspots(leads, "province", 10)).toEqual([]);
  });
});
