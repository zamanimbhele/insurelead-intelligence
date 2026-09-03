import { randomUUID } from "node:crypto";
import {
  appendAuditLog,
  findPossibleDuplicate,
  getConsentByLeadId,
  getLeadById,
  getLeads,
  saveConsent,
  saveLead,
  updateLead,
} from "./demo-store.ts";
import { allocateLead, getAllocations, getBuyers } from "./marketplace-store.ts";
import { createSupabaseAdminClient } from "./supabase/admin.ts";
import { getDataMode } from "./supabase/config.ts";
import {
  appendSupabaseAuditLog,
  captureSupabaseLead,
  fetchSupabaseAllocations,
  fetchSupabaseBuyers,
  fetchSupabaseConsent,
  fetchSupabaseLead,
  fetchSupabaseLeads,
  hasRecentSupabaseDuplicate,
  reserveSupabaseLead,
  updateSupabaseLead,
} from "./supabase/data.ts";
import type { ConsentRecord, Lead } from "./types.ts";

function requireAdminClient() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error(
      "Supabase mode requires a project URL, publishable key, and server-only secret key",
    );
  }
  return client;
}

export async function listRuntimeLeads() {
  return getDataMode() === "demo" ? getLeads() : fetchSupabaseLeads(requireAdminClient());
}

export async function getRuntimeLead(id: string) {
  return getDataMode() === "demo" ? getLeadById(id) : fetchSupabaseLead(requireAdminClient(), id);
}

export async function getRuntimeConsent(leadId: string) {
  return getDataMode() === "demo"
    ? getConsentByLeadId(leadId)
    : fetchSupabaseConsent(requireAdminClient(), leadId);
}

export async function updateRuntimeLead(id: string, changes: Partial<Lead>) {
  return getDataMode() === "demo"
    ? updateLead(id, changes)
    : updateSupabaseLead(requireAdminClient(), id, changes);
}

export async function appendRuntimeAuditLog(entry: {
  entity: "lead" | "consent" | "assignment" | "status";
  entityId: string;
  action: string;
  actor: string;
  details?: string;
}) {
  if (getDataMode() === "demo") return appendAuditLog(entry);
  await appendSupabaseAuditLog(requireAdminClient(), entry);
}

export async function hasRuntimeDuplicate(email: string, businessName: string) {
  return getDataMode() === "demo"
    ? Boolean(findPossibleDuplicate(email, businessName))
    : hasRecentSupabaseDuplicate(requireAdminClient(), email, businessName);
}

export async function captureRuntimeLead(lead: Omit<Lead, "id" | "createdAt">, consent: Omit<ConsentRecord, "leadId" | "timestamp">) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const completeLead: Lead = { ...lead, id, createdAt };
  const completeConsent: ConsentRecord = { ...consent, leadId: id, timestamp: createdAt };

  if (getDataMode() === "demo") {
    saveLead(completeLead);
    saveConsent(completeConsent);
    appendAuditLog({
      entity: "lead",
      entityId: id,
      action: "lead_created",
      actor: "public_form",
      details: `New lead captured via consultation form (${lead.insuranceProducts.length} product(s) selected).`,
    });
    return id;
  }

  return captureSupabaseLead(requireAdminClient(), completeLead, completeConsent);
}

export async function listRuntimeBuyers() {
  return getDataMode() === "demo" ? getBuyers() : fetchSupabaseBuyers(requireAdminClient());
}

export async function listRuntimeAllocations() {
  return getDataMode() === "demo" ? getAllocations() : fetchSupabaseAllocations(requireAdminClient());
}

export async function reserveRuntimeLead(input: {
  leadId: string;
  buyerId: string;
  priceCents: number;
  exclusive: boolean;
  actor: string;
}) {
  return getDataMode() === "demo"
    ? allocateLead(input)
    : reserveSupabaseLead(requireAdminClient(), input);
}
