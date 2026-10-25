// Practitioner authorisations for the dashboard and API routes, in both
// data modes. Supabase mode calls the database functions (which hold the
// rules); demo mode applies the same rules here so the demo behaves the
// same way.
import { appendAuditLog } from "./demo-store.ts";
import { getDemoAuthorisations, submitDemoAuthorisation, updateDemoAuthorisation } from "./demo-authorisations.ts";
import { getBuyers } from "./marketplace-store.ts";
import { getProductCatalogue } from "./product-catalogue.ts";
import { createSupabaseServerClient } from "./supabase/server.ts";
import { getDataMode } from "./supabase/config.ts";
import { isPlatformAdmin, type DashboardIdentity } from "./auth.ts";
import { todayIso, type EvidenceType, type PractitionerAuthorisation } from "./authorisations.ts";

type Row = {
  id: string; profile_id: string; organisation_id: string; category_id: string; evidence_type: EvidenceType;
  reference_number: string; provider_name: string | null; evidence_note: string | null; status: PractitionerAuthorisation["status"];
  expires_on: string | null; submitted_at: string; reviewed_at: string | null; review_note: string | null;
};

const BROKER_ROLES = ["broker_admin", "broker_agent", "campaign_manager"];

export function demoProfileId(identity: DashboardIdentity) {
  return `demo:${identity.demoAccountKey ?? identity.role}`;
}

export function currentProfileId(identity: DashboardIdentity) {
  return identity.mode === "demo" ? demoProfileId(identity) : identity.userId ?? "";
}

async function requireClient() {
  const client = await createSupabaseServerClient();
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

// Everything the caller may see: their own, their organisation's (broker
// admins), or every organisation's (platform staff). The database applies
// the same scope through row-level security.
export async function listAuthorisations(identity: DashboardIdentity): Promise<PractitionerAuthorisation[]> {
  if (getDataMode() === "demo") {
    const names = new Map(getBuyers().map((buyer) => [buyer.id, buyer.organisationName]));
    const all = getDemoAuthorisations().map((item) => ({ ...item, organisationName: names.get(item.organisationId) ?? item.organisationName }));
    if (isPlatformAdmin(identity) || identity.role === "compliance_auditor") return all;
    if (identity.role === "broker_admin") return all.filter((item) => item.organisationId === identity.organisationId);
    return all.filter((item) => item.profileId === demoProfileId(identity));
  }
  const client = await requireClient();
  const { data, error } = await client
    .from("practitioner_authorisations")
    .select("id, profile_id, organisation_id, category_id, evidence_type, reference_number, provider_name, evidence_note, status, expires_on, submitted_at, reviewed_at, review_note")
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(`Unable to load authorisations: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const profileIds = [...new Set(rows.map((row) => row.profile_id))];
  const organisationIds = [...new Set(rows.map((row) => row.organisation_id))];
  const [profiles, organisations] = await Promise.all([
    profileIds.length ? client.from("profiles").select("id, display_name, member_status").in("id", profileIds) : Promise.resolve({ data: [] }),
    organisationIds.length ? client.from("organisations").select("id, name").in("id", organisationIds) : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map(((profiles.data ?? []) as { id: string; display_name: string | null; member_status: string }[]).map((row) => [row.id, row]));
  const organisationById = new Map(((organisations.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    holderName: profileById.get(row.profile_id)?.display_name ?? "Team member",
    organisationId: row.organisation_id,
    organisationName: organisationById.get(row.organisation_id),
    categoryId: row.category_id,
    evidenceType: row.evidence_type,
    referenceNumber: row.reference_number,
    providerName: row.provider_name ?? undefined,
    evidenceNote: row.evidence_note ?? undefined,
    status: row.status,
    expiresOn: row.expires_on ?? undefined,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewNote: row.review_note ?? undefined,
    // Profiles outside the caller's view are assumed active; the database
    // decides what counts when it enforces.
    holderActive: (profileById.get(row.profile_id)?.member_status ?? "active") === "active",
  }));
}

export type SubmitAuthorisationInput = {
  categoryId: string;
  evidenceType: EvidenceType;
  referenceNumber: string;
  providerName?: string;
  evidenceNote?: string;
  expiresOn?: string;
};

export async function submitAuthorisation(identity: DashboardIdentity, input: SubmitAuthorisationInput) {
  if (getDataMode() === "demo") {
    if (!BROKER_ROLES.includes(identity.role) || !identity.organisationId) {
      throw new Error("Only an active broker or advisor may record an authorisation");
    }
    const catalogue = await getProductCatalogue();
    const category = catalogue.categories.find((item) => item.id === input.categoryId && item.status !== "retired");
    if (!category) throw new Error("Product category not found");
    if (!category.acceptedEvidence.includes(input.evidenceType)) throw new Error("That evidence is not accepted for this category");
    const reference = input.referenceNumber.trim();
    if (reference.length < 2 || reference.length > 60) throw new Error("A reference number is required");
    if (input.expiresOn && input.expiresOn < todayIso()) throw new Error("The expiry date has already passed");
    const created = submitDemoAuthorisation({
      profileId: demoProfileId(identity),
      holderName: identity.displayName ?? "Demo advisor",
      organisationId: identity.organisationId,
      categoryId: input.categoryId,
      evidenceType: input.evidenceType,
      referenceNumber: reference,
      providerName: input.providerName?.trim() || undefined,
      evidenceNote: input.evidenceNote?.trim() || undefined,
      expiresOn: input.expiresOn || undefined,
    });
    appendAuditLog({ entity: "organisation", entityId: created.organisationId, action: "authorisation_submitted", actor: created.holderName, details: `${created.categoryId} (${created.evidenceType})` });
    return created;
  }
  const client = await requireClient();
  const { data, error } = await client.rpc("submit_authorisation", {
    p_category_id: input.categoryId,
    p_evidence_type: input.evidenceType,
    p_reference_number: input.referenceNumber,
    p_provider_name: input.providerName ?? null,
    p_evidence_note: input.evidenceNote ?? null,
    p_expires_on: input.expiresOn || null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; status: string };
}

export async function reviewAuthorisation(
  identity: DashboardIdentity,
  id: string,
  input: { decision: "verify" | "reject" | "revoke"; note?: string; expiresOn?: string },
) {
  if (getDataMode() === "demo") {
    if (!isPlatformAdmin(identity)) throw new Error("Only a platform administrator may review authorisations");
    const current = getDemoAuthorisations().find((item) => item.id === id);
    if (!current) throw new Error("Authorisation not found");
    if (input.decision !== "revoke" && current.status !== "pending") throw new Error("Only a pending authorisation can be verified or rejected");
    if (input.decision === "revoke" && current.status !== "verified") throw new Error("Only a verified authorisation can be revoked");
    if (input.decision !== "verify" && !input.note?.trim()) throw new Error("Give a reason the holder will see");
    if (input.expiresOn && input.expiresOn < todayIso()) throw new Error("The expiry date has already passed");
    const status = input.decision === "verify" ? "verified" : input.decision === "reject" ? "rejected" : "revoked";
    const updated = updateDemoAuthorisation(id, { status, reviewNote: input.note?.trim() || undefined, expiresOn: input.expiresOn || undefined, reviewed: true });
    appendAuditLog({ entity: "organisation", entityId: updated.organisationId, action: `authorisation_${status}`, actor: identity.displayName ?? "Admin", details: `${updated.holderName}: ${updated.categoryId}` });
    return updated;
  }
  const client = await requireClient();
  const { data, error } = await client.rpc("review_authorisation", {
    p_authorisation_id: id,
    p_decision: input.decision,
    p_note: input.note ?? null,
    p_expires_on: input.expiresOn || null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; status: string };
}

export async function withdrawAuthorisation(identity: DashboardIdentity, id: string) {
  if (getDataMode() === "demo") {
    const current = getDemoAuthorisations().find((item) => item.id === id);
    if (!current || current.profileId !== demoProfileId(identity)) throw new Error("Authorisation not found");
    if (!["pending", "verified"].includes(current.status)) throw new Error("Only a pending or verified authorisation can be withdrawn");
    return updateDemoAuthorisation(id, { status: "withdrawn" });
  }
  const client = await requireClient();
  const { data, error } = await client.rpc("withdraw_authorisation", { p_authorisation_id: id });
  if (error) throw new Error(error.message);
  return data as { id: string; status: string };
}
