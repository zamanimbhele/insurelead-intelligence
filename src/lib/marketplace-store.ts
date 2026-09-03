import fs from "fs";
import path from "path";
import { appendAuditLog, getConsentByLeadId, getLeadById } from "./demo-store.ts";
import type { Buyer, ConsentRecord, Lead, LeadAllocation } from "./types.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const BUYERS_FILE = path.join(DATA_DIR, "buyers.json");
const ALLOCATIONS_FILE = path.join(DATA_DIR, "allocations.json");

function readJson<T>(file: string, fallback: T): T {
  try { const raw = fs.readFileSync(file, "utf-8"); return raw.trim() ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function writeJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
export function getBuyers(): Buyer[] { return readJson<Buyer[]>(BUYERS_FILE, []); }
export function getAllocations(): LeadAllocation[] { return readJson<LeadAllocation[]>(ALLOCATIONS_FILE, []); }

export function getEligibleBuyersForLead(lead: Lead, buyers: Buyer[]): Buyer[] {
  return buyers.filter((buyer) =>
    buyer.status === "active" &&
    buyer.minimumScore <= lead.score &&
    (buyer.provinces.length === 0 || buyer.provinces.includes(lead.province)) &&
    (buyer.industries.length === 0 || buyer.industries.includes(lead.industry))
  );
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
  if (!getEligibleBuyers(lead).some((item) => item.id === buyer.id)) throw new Error("Lead does not match the buyer's approved appetite");
  if (input.exclusive && getAllocations().some((item) => item.leadId === input.leadId && item.status !== "released")) throw new Error("An exclusive lead cannot have another active allocation");
  const allocations = getAllocations();
  const allocation: LeadAllocation = { id: `allocation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, leadId: input.leadId, buyerId: input.buyerId, status: "reserved", priceCents: input.priceCents, exclusive: input.exclusive, allocatedAt: new Date().toISOString() };
  allocations.unshift(allocation); writeJson(ALLOCATIONS_FILE, allocations);
  appendAuditLog({ entity: "assignment", entityId: allocation.id, action: "lead_reserved", actor: input.actor, details: `Lead ${input.leadId} reserved for buyer ${input.buyerId}` });
  return allocation;
}
