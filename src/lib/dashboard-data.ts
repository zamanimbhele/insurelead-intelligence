import { getLeads } from "./demo-store";
import { getAllocations, getBuyers, getSendingIdentities } from "./marketplace-store";
import { createSupabaseServerClient } from "./supabase/server";
import { getDataMode } from "./supabase/config";
import {
  fetchSupabaseAllocations,
  fetchSupabaseBrokerMembers,
  fetchSupabaseBuyers,
  fetchSupabaseConsents,
  fetchSupabaseLead,
  fetchSupabaseLeads,
  fetchSupabaseSendingIdentities,
} from "./supabase/data";
import type { DashboardIdentity } from "./auth";

async function requireServerClient() {
  const client = await createSupabaseServerClient();
  if (!client) throw new Error("Supabase is not configured for this environment");
  return client;
}

export async function getDashboardLeads() {
  return getDataMode() === "demo" ? getLeads() : fetchSupabaseLeads(await requireServerClient());
}

export async function getDashboardLead(id: string) {
  if (getDataMode() === "demo") return getLeads().find((lead) => lead.id === id);
  return fetchSupabaseLead(await requireServerClient(), id);
}

export async function getDashboardMarketplaceData() {
  if (getDataMode() === "demo") {
    const leads = getLeads();
    const { getConsentByLeadId } = await import("./demo-store");
    return {
      leads,
      buyers: getBuyers(),
      allocations: getAllocations(),
      consents: new Map(leads.map((lead) => [lead.id, getConsentByLeadId(lead.id)])),
    };
  }

  const client = await requireServerClient();
  const leads = await fetchSupabaseLeads(client);
  const [buyers, allocations, consents] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseAllocations(client),
    fetchSupabaseConsents(client, leads.map((lead) => lead.id)),
  ]);
  return { leads, buyers, allocations, consents };
}

export async function getDashboardAllocationData() {
  if (getDataMode() === "demo") {
    return { leads: getLeads(), buyers: getBuyers(), allocations: getAllocations() };
  }
  const client = await requireServerClient();
  const [leads, buyers, allocations] = await Promise.all([
    fetchSupabaseLeads(client),
    fetchSupabaseBuyers(client),
    fetchSupabaseAllocations(client),
  ]);
  return { leads, buyers, allocations };
}

export async function getDashboardBrokerDirectory() {
  if (getDataMode() === "demo") {
    return { buyers: getBuyers(), sendingIdentities: getSendingIdentities() };
  }
  const client = await requireServerClient();
  const [buyers, sendingIdentities] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseSendingIdentities(client),
  ]);
  return { buyers, sendingIdentities };
}

export async function getDashboardBrokerWorkspace(identity: DashboardIdentity) {
  if (getDataMode() === "demo") {
    const buyer = getBuyers()[0];
    return {
      buyer,
      members: [],
      sendingIdentities: buyer ? getSendingIdentities(buyer.id) : [],
    };
  }
  if (!identity.organisationId) return null;

  const client = await requireServerClient();
  const [buyers, members, sendingIdentities] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseBrokerMembers(client, identity.organisationId),
    fetchSupabaseSendingIdentities(client, identity.organisationId),
  ]);
  return {
    buyer: buyers.find((candidate) => candidate.id === identity.organisationId),
    members,
    sendingIdentities,
  };
}
