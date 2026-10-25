import fs from "fs";
import path from "path";
import { appendAuditLog, getConsentByLeadId, getLeadById } from "./demo-store.ts";
import { DEFAULT_CAMPAIGN_DAILY_SEND_LIMIT, DEFAULT_CAMPAIGN_MONTHLY_SEND_LIMIT } from "./campaign-quota.ts";
import { normaliseWorkspaceType } from "./workspace.ts";
import { authorisedProductIds } from "./authorisations.ts";
import { getDemoAuthorisations } from "./demo-authorisations.ts";
import { FALLBACK_CATALOGUE } from "./products.ts";
import { COMPANY_BRAND, missingDisclosureDetails, type OrganisationBrand } from "./brand.ts";
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
  const authorisations = getDemoAuthorisations();
  return readJson<Buyer[]>(BUYERS_FILE, []).map((buyer) => ({
    ...buyer,
    workspaceType: normaliseWorkspaceType(buyer.workspaceType),
    onboardingStatus: buyer.onboardingStatus ?? "approved",
    cities: buyer.cities ?? [],
    insuranceProducts: buyer.insuranceProducts ?? [],
    dailyLeadCapacity: buyer.dailyLeadCapacity ?? 25,
    contactSlaHours: buyer.contactSlaHours ?? 24,
    acceptsSharedLeads: buyer.acceptsSharedLeads ?? false,
    acceptsCampaigns: buyer.acceptsCampaigns ?? false,
    campaignDailySendLimit: buyer.campaignDailySendLimit ?? DEFAULT_CAMPAIGN_DAILY_SEND_LIMIT,
    campaignMonthlySendLimit: buyer.campaignMonthlySendLimit ?? DEFAULT_CAMPAIGN_MONTHLY_SEND_LIMIT,
    authorisedProducts: authorisedProductIds(FALLBACK_CATALOGUE, authorisations, buyer.id),
    brand: buyer.brand ?? COMPANY_BRAND,
  }));
}
export function getAllocations(): LeadAllocation[] { return readJson<LeadAllocation[]>(ALLOCATIONS_FILE, []); }
export function getSendingIdentities(organisationId?: string): BrokerSendingIdentity[] {
  const identities = readJson<BrokerSendingIdentity[]>(SENDING_IDENTITIES_FILE, []);
  return organisationId
    ? identities.filter((identity) => identity.organisationId === organisationId)
    : identities;
}

// Demo-mode counterpart to create_broker_sending_identity() (see
// supabase/migrations/202610110001_broker_sending_identity_self_service.sql):
// a broker's self-service "add a sending identity" action. Always
// created 'pending' - only the platform-admin review action in demo mode
// (none exists yet; demo mode has no tenancy/review UI at all, same
// documented limitation as the rest of multi-broker tenancy) or, in
// Supabase mode, review_sending_identity() can move it to 'verified'.
// The first identity for an organisation becomes its default, matching
// the Supabase RPC's own rule.
export function createSendingIdentity(
  input: { organisationId: string; domain: string; fromName: string; fromEmail: string; replyToEmail?: string },
  actorLabel: string,
): BrokerSendingIdentity {
  const domain = input.domain.trim();
  const fromName = input.fromName.trim();
  const fromEmail = input.fromEmail.trim().toLowerCase();
  const replyToEmail = input.replyToEmail?.trim().toLowerCase() || undefined;
  if (!domain) throw new Error("A sending domain is required");
  if (!fromName) throw new Error("A from-name is required");
  if (!fromEmail.includes("@")) throw new Error("A valid from-email address is required");
  if (replyToEmail && !replyToEmail.includes("@")) throw new Error("The reply-to address is not valid");

  const identities = readJson<BrokerSendingIdentity[]>(SENDING_IDENTITIES_FILE, []);
  if (identities.some((identity) => identity.organisationId === input.organisationId && identity.fromEmail === fromEmail)) {
    throw new Error("A sending identity with this from-email already exists for your organisation");
  }

  const isDefault = !identities.some((identity) => identity.organisationId === input.organisationId && identity.isDefault);
  const identity: BrokerSendingIdentity = {
    id: `sid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    organisationId: input.organisationId,
    domain,
    fromName,
    fromEmail,
    replyToEmail,
    provider: "resend",
    status: "pending",
    isDefault,
    createdAt: new Date().toISOString(),
  };
  identities.push(identity);
  writeJson(SENDING_IDENTITIES_FILE, identities);

  appendAuditLog({
    entity: "sending_identity",
    entityId: identity.id,
    action: "sending_identity_created",
    actor: actorLabel,
    details: `${fromEmail} (${domain})${isDefault ? " - set as default" : ""}`,
  });

  return identity;
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
  if (buyer.authorisedProducts && !lead.insuranceProducts.some((product) => buyer.authorisedProducts!.includes(product))) {
    reasons.push("Broker is not authorised for the lead's products");
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

// Demo-mode counterpart to set_workspace_type() (migration
// 202610250002_individual_workspaces.sql).
export function setBuyerWorkspaceType(organisationId: string, workspaceType: Buyer["workspaceType"], actorLabel: string): Buyer {
  const buyers = readJson<Buyer[]>(BUYERS_FILE, []);
  const index = buyers.findIndex((buyer) => buyer.id === organisationId);
  if (index === -1) throw new Error("Broker organisation not found");
  const previous = getBuyers()[index];
  if (previous.workspaceType !== workspaceType) {
    buyers[index] = { ...buyers[index], workspaceType };
    writeJson(BUYERS_FILE, buyers);
    appendAuditLog({
      entity: "organisation",
      entityId: organisationId,
      action: "workspace_type_changed",
      actor: actorLabel,
      details: `${previous.organisationName}: ${previous.workspaceType} -> ${workspaceType}`,
    });
  }
  return getBuyers()[index];
}

// Demo-mode counterpart to update_brand_settings() (migration
// 202610260001_personal_brand.sql); same rules.
export function setBuyerBrand(organisationId: string, brand: OrganisationBrand, actorLabel: string): Buyer {
  if (brand.mode === "personal" && missingDisclosureDetails(brand).length) {
    throw new Error("A personal brand needs your name, capacity, FSP name and FSP number");
  }
  const buyers = readJson<Buyer[]>(BUYERS_FILE, []);
  const index = buyers.findIndex((buyer) => buyer.id === organisationId);
  if (index === -1) throw new Error("Broker organisation not found");
  const clean = (value?: string) => value?.trim() || undefined;
  buyers[index] = {
    ...buyers[index],
    brand: { mode: brand.mode, displayName: clean(brand.displayName), capacity: brand.capacity, fspName: clean(brand.fspName), fspNumber: clean(brand.fspNumber) },
  };
  writeJson(BUYERS_FILE, buyers);
  appendAuditLog({
    entity: "organisation", entityId: organisationId, action: "brand_settings_updated", actor: actorLabel,
    details: `${buyers[index].organisationName}: ${brand.mode} brand`,
  });
  return getBuyers()[index];
}

// Demo-mode counterpart to update_buyer_preferences() (migration
// 202610180001): the platform-admin appetite and permission editor on the
// Broker Directory. Input is already validated by brokerPreferencesSchema
// in the API route; this only persists it and writes the audit entry.
export function updateBuyerPreferences(
  organisationId: string,
  changes: Pick<
    Buyer,
    "insuranceProducts" | "provinces" | "minimumScore" | "dailyLeadCapacity" | "acceptsCampaigns" | "acceptsSharedLeads"
  > & Partial<Pick<Buyer, "campaignDailySendLimit" | "campaignMonthlySendLimit">>,
  actorLabel: string,
): Buyer {
  const buyers = readJson<Buyer[]>(BUYERS_FILE, []);
  const index = buyers.findIndex((buyer) => buyer.id === organisationId);
  if (index === -1) throw new Error("Broker organisation not found");
  const previous = getBuyers()[index];
  if (previous.authorisedProducts && changes.insuranceProducts.some((product) => !previous.authorisedProducts!.includes(product))) {
    throw new Error("The broker is not authorised for one or more of these products");
  }
  const definedChanges = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  buyers[index] = { ...buyers[index], ...definedChanges };
  writeJson(BUYERS_FILE, buyers);
  appendAuditLog({
    entity: "organisation",
    entityId: organisationId,
    action: "buyer_preferences_updated",
    actor: actorLabel,
    details: `${previous.organisationName}: products [${previous.insuranceProducts.join(", ") || "none"}] -> [${changes.insuranceProducts.join(", ") || "none"}], campaigns ${previous.acceptsCampaigns ? "on" : "off"} -> ${changes.acceptsCampaigns ? "on" : "off"}`,
  });
  return getBuyers()[index];
}
