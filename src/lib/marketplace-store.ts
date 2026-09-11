import fs from "fs";
import path from "path";
import { appendAuditLog, getConsentByLeadId, getLeadById } from "./demo-store.ts";
import type {
  BrokerSendingIdentity,
  Buyer,
  BuyerMatchDecision,
  ConsentRecord,
  Lead,
  LeadAllocation,
} from "./types.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const BUYERS_FILE = path.join(DATA_DIR, "buyers.json");
const ALLOCATIONS_FILE = path.join(DATA_DIR, "allocations.json");
const SENDING_IDENTITIES_FILE = path.join(DATA_DIR, "sending-identities.json");

function readJson<T>(file: string, fallback: T): T {
  try { const raw = fs.readFileSync(file, "utf-8"); return raw.trim() ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function writeJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
export function getBuyers(): Buyer[] {
  return readJson<Buyer[]>(BUYERS_FILE, []).map((buyer) => ({
    ...buyer,
    onboardingStatus: buyer.onboardingStatus ?? "approved",
    cities: buyer.cities ?? [],
    insuranceProducts: buyer.insuranceProducts ?? [],
    dailyLeadCapacity: buyer.dailyLeadCapacity ?? 25,
    contactSlaHours: buyer.contactSlaHours ?? 24,
    acceptsSharedLeads: buyer.acceptsSharedLeads ?? false,
  }));
}
export function getAllocations(): LeadAllocation[] { return readJson<LeadAllocation[]>(ALLOCATIONS_FILE, []); }
export function getSendingIdentities(organisationId?: string): BrokerSendingIdentity[] {
  const identities = readJson<BrokerSendingIdentity[]>(SENDING_IDENTITIES_FILE, []);
  return organisationId
    ? identities.filter((identity) => identity.organisationId === organisationId)
    : identities;
}

export function getBuyerMatchDecision(
  lead: Lead,
  buyer: Buyer,
  allocations: LeadAllocation[] = [],
  now = new Date(),
): BuyerMatchDecision {
  const reasons: string[] = [];
  if (buyer.status !== "active" || buyer.onboardingStatus !== "approved") {
    reasons.push("Buyer organisation is not approved and active");
  }
  if (buyer.minimumScore > lead.score) reasons.push(`Lead score is below the approved minimum of ${buyer.minimumScore}`);
  if (buyer.provinces.length > 0 && !buyer.provinces.includes(lead.province)) {
    reasons.push(`${lead.province} is outside the approved territory`);
  }
  if (buyer.cities.length > 0 && !buyer.cities.includes(lead.city)) {
    reasons.push(`${lead.city} is outside the approved city coverage`);
  }
  if (buyer.industries.length > 0 && (!lead.industry || !buyer.industries.includes(lead.industry))) {
    reasons.push("Lead industry is outside the approved appetite");
  }
  if (
    buyer.insuranceProducts.length > 0
    && !lead.insuranceProducts.some((product) => buyer.insuranceProducts.includes(product))
  ) {
    reasons.push("No selected insurance product matches the approved appetite");
  }

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const allocatedToday = allocations.filter((allocation) =>
    allocation.buyerId === buyer.id
    && allocation.status !== "released"
    && new Date(allocation.allocatedAt) >= startOfDay
  ).length;
  if (allocatedToday >= buyer.dailyLeadCapacity) {
    reasons.push(`Daily lead capacity of ${buyer.dailyLeadCapacity} has been reached`);
  }

  return { buyerId: buyer.id, leadId: lead.id, matched: reasons.length === 0, reasons };
}

export function getEligibleBuyersForLead(
  lead: Lead,
  buyers: Buyer[],
  allocations: LeadAllocation[] = [],
): Buyer[] {
  return buyers.filter((buyer) => getBuyerMatchDecision(lead, buyer, allocations).matched);
}

export function getAllocationEligibility(
  lead: Lead | undefined,
  consent: ConsentRecord | undefined,
  allocations: LeadAllocation[],
): { allowed: boolean; reason?: string } {
  if (!lead) return { allowed: false, reason: "Lead not found" };
  if (lead.doNotContact) return { allowed: false, reason: "Lead is marked do not contact" };
  if (!consent?.contactConsent || !consent.partnerSharingConsent) {
    return { allowed: false, reason: "Partner-sharing consent is not recorded" };
  }

  const active = allocations.filter((item) => item.leadId === lead.id && item.status !== "released");
  const limit = consent.maxPartnerRecipients ?? 1;
  if (active.length >= limit) return { allowed: false, reason: "Consent recipient limit reached" };
  if (active.some((item) => item.exclusive)) return { allowed: false, reason: "Lead is exclusively allocated" };
  return { allowed: true };
}

export function getEligibleBuyers(lead: Lead): Buyer[] {
  return getEligibleBuyersForLead(lead, getBuyers());
}

export function canAllocateLead(leadId: string): { allowed: boolean; reason?: string } {
  const lead = getLeadById(leadId);
  const consent = getConsentByLeadId(leadId);
  return getAllocationEligibility(lead, consent, getAllocations());
}

export function allocateLead(input: { leadId: string; buyerId: string; priceCents: number; exclusive: boolean; actor: string }): LeadAllocation {
  const eligibility = canAllocateLead(input.leadId);
  if (!eligibility.allowed) throw new Error(eligibility.reason);
  const lead = getLeadById(input.leadId)!;
  const buyer = getBuyers().find((item) => item.id === input.buyerId);
  if (!buyer) throw new Error("Buyer not found");
  const decision = getBuyerMatchDecision(lead, buyer, getAllocations());
  if (!decision.matched) throw new Error(decision.reasons[0] ?? "Lead does not match the buyer's approved appetite");
  if (input.exclusive && getAllocations().some((item) => item.leadId === input.leadId && item.status !== "released")) throw new Error("An exclusive lead cannot have another active allocation");
  const allocations = getAllocations();
  const allocation: LeadAllocation = { id: `allocation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, leadId: input.leadId, buyerId: input.buyerId, status: "reserved", priceCents: input.priceCents, exclusive: input.exclusive, allocatedAt: new Date().toISOString() };
  allocations.unshift(allocation); writeJson(ALLOCATIONS_FILE, allocations);
  appendAuditLog({ entity: "assignment", entityId: allocation.id, action: "lead_reserved", actor: input.actor, details: `Lead ${input.leadId} reserved for buyer ${input.buyerId}` });
  return allocation;
}
