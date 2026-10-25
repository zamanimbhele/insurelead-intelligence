import { describe, expect, it } from "vitest";
import {
  authorisedCategoryIds,
  authorisedProductIds,
  categoryStanding,
  expiringSoon,
  type PractitionerAuthorisation,
} from "./authorisations";
import { FALLBACK_CATALOGUE } from "./products";

function auth(overrides: Partial<PractitionerAuthorisation>): PractitionerAuthorisation {
  return {
    id: "a1", profileId: "p1", holderName: "Lerato", organisationId: "org1", categoryId: "long_term_insurance",
    evidenceType: "representative_appointment", referenceNumber: "FSP 1", status: "verified",
    submittedAt: "2026-10-01T00:00:00Z", holderActive: true, ...overrides,
  };
}

const TODAY = "2026-10-25";

describe("what an organisation may sell", () => {
  it("counts only verified, unexpired authorisations of active members", () => {
    const list = [
      auth({ id: "a1" }),
      auth({ id: "a2", categoryId: "short_term_insurance", status: "pending" }),
      auth({ id: "a3", categoryId: "investments", expiresOn: "2026-10-24" }),
      auth({ id: "a4", categoryId: "medical_schemes", holderActive: false }),
      auth({ id: "a5", categoryId: "banking_credit", organisationId: "other" }),
    ];
    expect(authorisedCategoryIds(list, "org1", TODAY)).toEqual(["long_term_insurance"]);
    expect(authorisedProductIds(FALLBACK_CATALOGUE, list, "org1", TODAY)).toEqual(["funeral_cover", "life_insurance"]);
  });

  it("still counts an authorisation on its expiry date", () => {
    expect(authorisedCategoryIds([auth({ expiresOn: TODAY })], "org1", TODAY)).toEqual(["long_term_insurance"]);
  });
});

describe("expiry and standing", () => {
  it("lists verified authorisations lapsing within the window", () => {
    const now = new Date("2026-10-25T08:00:00Z");
    const list = [
      auth({ id: "soon", expiresOn: "2026-11-10" }),
      auth({ id: "later", expiresOn: "2027-03-01" }),
      auth({ id: "gone", expiresOn: "2026-10-01" }),
      auth({ id: "pending", status: "pending", expiresOn: "2026-11-01" }),
    ];
    expect(expiringSoon(list, 30, now).map((item) => item.id)).toEqual(["soon"]);
  });

  it("describes each category from the person's own records", () => {
    const list = [
      auth({ id: "old", status: "rejected", categoryId: "investments", submittedAt: "2026-09-01T00:00:00Z" }),
      auth({ id: "new", status: "pending", categoryId: "investments", submittedAt: "2026-10-20T00:00:00Z" }),
      auth({ id: "lapsed", categoryId: "short_term_insurance", expiresOn: "2026-01-01" }),
    ];
    expect(categoryStanding(list, "p1", "long_term_insurance", TODAY).state).toBe("none");
    expect(categoryStanding(list, "p1", "investments", TODAY).state).toBe("pending");
    expect(categoryStanding(list, "p1", "short_term_insurance", TODAY).state).toBe("expired");
    expect(categoryStanding([auth({})], "p1", "long_term_insurance", TODAY).state).toBe("authorised");
  });
});

describe("in-app enforcement", async () => {
  const { getBuyerMatchDecision } = await import("./marketplace-store");
  const { validateCampaign } = await import("./campaign-policy");
  const buyer = {
    id: "org1", organisationName: "Solo", workspaceType: "individual", buyerType: "broker", status: "active",
    onboardingStatus: "approved", provinces: [], cities: [], industries: [], insuranceProducts: [], minimumScore: 0,
    dailyLeadCapacity: 10, contactSlaHours: 24, acceptsSharedLeads: false, acceptsCampaigns: true,
    campaignDailySendLimit: 100, campaignMonthlySendLimit: 1000, contactEmail: "solo@example.co.za",
    authorisedProducts: ["life_insurance", "funeral_cover"],
  } as const;
  const lead = { id: "l1", score: 50, province: "Gauteng", city: "Johannesburg", insuranceProducts: ["motor_insurance"] };

  it("does not match a lead the broker is not authorised for", () => {
    const decision = getBuyerMatchDecision(lead as never, { ...buyer } as never, []);
    expect(decision.matched).toBe(false);
    expect(decision.reasons).toContain("Broker is not authorised for the lead's products");
    expect(getBuyerMatchDecision({ ...lead, insuranceProducts: ["life_insurance"] } as never, { ...buyer } as never, []).matched).toBe(true);
  });

  it("flags a campaign for products nobody is authorised for", () => {
    const issues = validateCampaign({
      campaign: { organisationId: "org1", insuranceProducts: ["motor_insurance"] } as never,
      buyer: { ...buyer, insuranceProducts: ["motor_insurance"] } as never,
      sendingIdentity: undefined,
      content: undefined,
      audience: [],
    });
    expect(issues.map((issue) => issue.code)).toContain("product_authorisation");
  });
});
