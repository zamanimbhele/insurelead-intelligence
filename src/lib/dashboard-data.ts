import { getLeads } from "./demo-store";
import { getAllocations, getBuyers } from "./marketplace-store";
import { createSupabaseServerClient } from "./supabase/server";
import { getDataMode } from "./supabase/config";
import {
  fetchSupabaseAllocations,
  fetchSupabaseBuyers,
  fetchSupabaseConsents,
  fetchSupabaseLead,
  fetchSupabaseLeads,
} from "./supabase/data";

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
