import { describe, expect, it } from "vitest";
import { brokerPreferencesSchema } from "./brokerPreferences";

const valid = {
  insuranceProducts: ["motor_insurance", "business_insurance"],
  provinces: ["Gauteng", "KwaZulu-Natal"],
  minimumScore: 40,
  dailyLeadCapacity: 25,
  acceptsCampaigns: true,
  acceptsSharedLeads: false,
};

describe("broker preferences schema", () => {
  it("accepts a valid appetite", () => {
    expect(brokerPreferencesSchema.safeParse(valid).success).toBe(true);
  });

  it("allows an empty product list while campaigns stay disabled", () => {
    expect(brokerPreferencesSchema.safeParse({ ...valid, insuranceProducts: [], acceptsCampaigns: false }).success).toBe(true);
  });

  it("rejects enabling campaigns with no approved products", () => {
    const result = brokerPreferencesSchema.safeParse({ ...valid, insuranceProducts: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/at least one approved insurance product/);
  });

  it("rejects unknown products and provinces", () => {
    expect(brokerPreferencesSchema.safeParse({ ...valid, insuranceProducts: ["pet_insurance"] }).success).toBe(false);
    expect(brokerPreferencesSchema.safeParse({ ...valid, provinces: ["Gauteng Province"] }).success).toBe(false);
  });

  it("rejects fractional or out-of-range numbers", () => {
    expect(brokerPreferencesSchema.safeParse({ ...valid, minimumScore: 72.5 }).success).toBe(false);
    expect(brokerPreferencesSchema.safeParse({ ...valid, minimumScore: 101 }).success).toBe(false);
    expect(brokerPreferencesSchema.safeParse({ ...valid, dailyLeadCapacity: 0 }).success).toBe(false);
  });
});

describe("campaign send limits", () => {
  it("are optional, so older clients keep working", () => {
    expect(brokerPreferencesSchema.safeParse(valid).success).toBe(true);
  });

  it("accept whole numbers with daily not above monthly", () => {
    expect(brokerPreferencesSchema.safeParse({ ...valid, campaignDailySendLimit: 300, campaignMonthlySendLimit: 5000 }).success).toBe(true);
  });

  it("reject a daily limit above the monthly limit", () => {
    const result = brokerPreferencesSchema.safeParse({ ...valid, campaignDailySendLimit: 600, campaignMonthlySendLimit: 500 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/cannot exceed the monthly limit/);
  });

  it("reject zero and fractional limits", () => {
    expect(brokerPreferencesSchema.safeParse({ ...valid, campaignDailySendLimit: 0 }).success).toBe(false);
    expect(brokerPreferencesSchema.safeParse({ ...valid, campaignMonthlySendLimit: 10.5 }).success).toBe(false);
  });
});
