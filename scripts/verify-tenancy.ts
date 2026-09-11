import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getBuyerMatchDecision } from "../src/lib/marketplace-store.ts";
import type { Buyer, Lead, LeadAllocation } from "../src/lib/types.ts";

const lead: Lead = {
  id: "lead_tenancy_test",
  applicantType: "individual",
  province: "Gauteng",
  city: "Johannesburg",
  insuranceProducts: ["motor_insurance"],
  currentInsuranceStatus: "not_currently_insured",
  preferredContactChannel: "email",
  contactFullName: "Synthetic Applicant",
  contactEmail: "synthetic@example.test",
  contactMobile: "0820000000",
  status: "new",
  score: 58,
  scoreBand: "warm",
  scoreExplanation: "Synthetic tenancy assertion",
  utm: {},
  doNotContact: false,
  createdAt: "2026-09-11T08:00:00.000Z",
};

const buyer: Buyer = {
  id: "buyer_personal_lines",
  organisationName: "Synthetic Personal Lines Broker",
  buyerType: "broker",
  status: "active",
  onboardingStatus: "approved",
  provinces: ["Gauteng"],
  cities: ["Johannesburg"],
  industries: [],
  insuranceProducts: ["motor_insurance"],
  minimumScore: 40,
  dailyLeadCapacity: 1,
  contactSlaHours: 4,
  acceptsSharedLeads: false,
  contactEmail: "broker@example.test",
};

assert.equal(getBuyerMatchDecision(lead, buyer).matched, true);

const productMismatch = getBuyerMatchDecision(lead, {
  ...buyer,
  insuranceProducts: ["business_insurance"],
});
assert.equal(productMismatch.matched, false);
assert(productMismatch.reasons.some((reason) => reason.includes("insurance product")));

const territoryMismatch = getBuyerMatchDecision(lead, { ...buyer, cities: ["Pretoria"] });
assert.equal(territoryMismatch.matched, false);
assert(territoryMismatch.reasons.some((reason) => reason.includes("city coverage")));

const allocation: LeadAllocation = {
  id: "allocation_capacity_test",
  leadId: "another_lead",
  buyerId: buyer.id,
  status: "accepted",
  priceCents: 75000,
  exclusive: true,
  allocatedAt: "2026-09-11T09:00:00.000Z",
};
const atCapacity = getBuyerMatchDecision(lead, buyer, [allocation], new Date("2026-09-11T12:00:00.000Z"));
assert.equal(atCapacity.matched, false);
assert(atCapacity.reasons.some((reason) => reason.includes("Daily lead capacity")));

const migration = readFileSync(
  new URL("../supabase/migrations/202609110001_multi_broker_tenancy.sql", import.meta.url),
  "utf8",
);
for (const requiredControl of [
  "broker organisations view allocated leads",
  "allocation.status in ('reserved', 'accepted', 'disputed')",
  "respond_to_lead_allocation",
  "evaluate_lead_buyer_match",
  "broker_sending_identities",
  "daily_lead_capacity",
]) {
  assert(migration.includes(requiredControl), `Missing tenancy control: ${requiredControl}`);
}

console.log("Broker tenancy matching assertions passed");
