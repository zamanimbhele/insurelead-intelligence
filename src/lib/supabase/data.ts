import type { SupabaseClient } from "@supabase/supabase-js";
import type { Buyer, ConsentRecord, Lead, LeadAllocation } from "../types.ts";

type LeadRow = {
  id: string;
  business_name: string;
  trading_name: string | null;
  industry: string;
  business_type: string | null;
  employee_band: string | null;
  turnover_band: string | null;
  years_in_operation: string | null;
  province: string;
  city: string;
  suburb: string | null;
  postal_code: string | null;
  website: string | null;
  insurance_products: string[];
  current_insurance_status: string | null;
  renewal_month: string | null;
  financial_year_end_month: string | null;
  main_concern: string | null;
  preferred_contact_time: string | null;
  preferred_contact_channel: string | null;
  contact_full_name: string;
  contact_role: string | null;
  contact_email: string;
  contact_mobile: string;
  status: string;
  score: number;
  score_band: string;
  score_explanation: string;
  campaign_source: string | null;
  utm: Lead["utm"] | null;
  referrer: string | null;
  do_not_contact: boolean;
  assigned_broker: string | null;
  created_at: string;
};

type ConsentRow = {
  lead_id: string;
  privacy_notice_accepted: boolean;
  contact_consent: boolean;
  marketing_consent: boolean;
  partner_sharing_consent: boolean;
  max_partner_recipients: number;
  accuracy_confirmed: boolean;
  non_binding_acknowledged: boolean;
  wording_version: string;
  source_url: string;
  consented_at: string;
};

type OrganisationRow = {
  id: string;
  name: string;
  organisation_type: "broker" | "insurer";
  status: Buyer["status"];
  contact_email: string;
};

type PreferenceRow = {
  organisation_id: string;
  provinces: string[];
  industries: string[];
  minimum_score: number;
};

type AllocationRow = {
  id: string;
  lead_id: string;
  buyer_organisation_id: string;
  status: LeadAllocation["status"];
  price_cents: number;
  exclusive: boolean;
  allocated_at: string;
  accepted_at: string | null;
};

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function optional(value: string | null | undefined) {
  return value ?? undefined;
}

export function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    businessName: row.business_name,
    tradingName: optional(row.trading_name),
    industry: row.industry,
    businessType: row.business_type ?? "Not provided",
    employeeBand: row.employee_band ?? "Not provided",
    turnoverBand: row.turnover_band ?? "Not provided",
    yearsInOperation: row.years_in_operation ?? "Not provided",
    province: row.province,
    city: row.city,
    suburb: optional(row.suburb),
    postalCode: optional(row.postal_code),
    website: optional(row.website),
    insuranceProducts: row.insurance_products as Lead["insuranceProducts"],
    currentInsuranceStatus: (row.current_insurance_status ?? "unsure") as Lead["currentInsuranceStatus"],
    renewalMonth: optional(row.renewal_month),
    financialYearEndMonth: optional(row.financial_year_end_month),
    mainConcern: optional(row.main_concern),
    preferredContactTime: optional(row.preferred_contact_time),
    preferredContactChannel: (row.preferred_contact_channel ?? "email") as Lead["preferredContactChannel"],
    contactFullName: row.contact_full_name,
    contactRole: row.contact_role ?? "Not provided",
    contactEmail: row.contact_email,
    contactMobile: row.contact_mobile,
    status: row.status as Lead["status"],
    score: row.score,
    scoreBand: row.score_band as Lead["scoreBand"],
    scoreExplanation: row.score_explanation,
    campaignSource: optional(row.campaign_source),
    utm: row.utm ?? {},
    referrer: optional(row.referrer),
    doNotContact: row.do_not_contact,
    assignedBroker: optional(row.assigned_broker),
    createdAt: row.created_at,
  };
}

function mapConsent(row: ConsentRow): ConsentRecord {
  return {
    leadId: row.lead_id,
    privacyNoticeAccepted: row.privacy_notice_accepted,
    contactConsent: row.contact_consent,
    marketingConsent: row.marketing_consent,
    partnerSharingConsent: row.partner_sharing_consent,
    maxPartnerRecipients: row.max_partner_recipients as 1 | 3,
    accuracyConfirmed: row.accuracy_confirmed,
    nonBindingAcknowledged: row.non_binding_acknowledged,
    consentWordingVersion: row.wording_version,
    sourceUrl: row.source_url,
    timestamp: row.consented_at,
  };
}

function mapAllocation(row: AllocationRow): LeadAllocation {
  return {
    id: row.id,
    leadId: row.lead_id,
    buyerId: row.buyer_organisation_id,
    status: row.status,
    priceCents: row.price_cents,
    exclusive: row.exclusive,
    allocatedAt: row.allocated_at,
    acceptedAt: optional(row.accepted_at),
  };
}

export async function fetchSupabaseLeads(client: SupabaseClient, limit = 500): Promise<Lead[]> {
  const { data, error } = await client.from("leads").select("*").order("created_at", { ascending: false }).limit(limit);
  fail("Unable to load leads", error);
  return ((data ?? []) as LeadRow[]).map(mapLead);
}

export async function fetchSupabaseLead(client: SupabaseClient, id: string): Promise<Lead | undefined> {
  const { data, error } = await client.from("leads").select("*").eq("id", id).maybeSingle();
  fail("Unable to load lead", error);
  return data ? mapLead(data as LeadRow) : undefined;
}

export async function fetchSupabaseConsent(client: SupabaseClient, leadId: string): Promise<ConsentRecord | undefined> {
  const { data, error } = await client
    .from("lead_consents")
    .select("*")
    .eq("lead_id", leadId)
    .is("withdrawn_at", null)
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail("Unable to load consent", error);
  return data ? mapConsent(data as ConsentRow) : undefined;
}

export async function fetchSupabaseConsents(client: SupabaseClient, leadIds: string[]) {
  const records = new Map<string, ConsentRecord>();
  if (leadIds.length === 0) return records;

  const { data, error } = await client
    .from("lead_consents")
    .select("*")
    .in("lead_id", leadIds)
    .is("withdrawn_at", null)
    .order("consented_at", { ascending: false });
  fail("Unable to load lead consents", error);

  for (const row of (data ?? []) as ConsentRow[]) {
    if (!records.has(row.lead_id)) records.set(row.lead_id, mapConsent(row));
  }
  return records;
}

export async function fetchSupabaseBuyers(client: SupabaseClient): Promise<Buyer[]> {
  const [organisationResult, preferenceResult] = await Promise.all([
    client
      .from("organisations")
      .select("id, name, organisation_type, status, contact_email")
      .in("organisation_type", ["broker", "insurer"]),
    client.from("buyer_preferences").select("organisation_id, provinces, industries, minimum_score"),
  ]);
  fail("Unable to load buyer organisations", organisationResult.error);
  fail("Unable to load buyer preferences", preferenceResult.error);

  const preferences = new Map(
    ((preferenceResult.data ?? []) as PreferenceRow[]).map((row) => [row.organisation_id, row]),
  );

  return ((organisationResult.data ?? []) as OrganisationRow[]).map((organisation) => {
    const preference = preferences.get(organisation.id);
    return {
      id: organisation.id,
      organisationName: organisation.name,
      buyerType: organisation.organisation_type,
      status: organisation.status,
      provinces: preference?.provinces ?? [],
      industries: preference?.industries ?? [],
      minimumScore: preference?.minimum_score ?? 0,
      contactEmail: organisation.contact_email,
    };
  });
}

export async function fetchSupabaseAllocations(client: SupabaseClient): Promise<LeadAllocation[]> {
  const { data, error } = await client
    .from("lead_allocations")
    .select("*")
    .order("allocated_at", { ascending: false });
  fail("Unable to load allocations", error);
  return ((data ?? []) as AllocationRow[]).map(mapAllocation);
}

export async function hasRecentSupabaseDuplicate(
  client: SupabaseClient,
  email: string,
  businessName: string,
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("leads")
    .select("business_name")
    .eq("contact_email", email.toLowerCase())
    .gte("created_at", since)
    .limit(20);
  fail("Unable to check duplicate lead", error);
  return (data ?? []).some((row) =>
    String(row.business_name).toLowerCase() === businessName.toLowerCase()
  );
}

export async function captureSupabaseLead(
  client: SupabaseClient,
  lead: Lead,
  consent: ConsentRecord,
) {
  const { data, error } = await client.rpc("capture_public_lead", {
    payload: { lead, consent },
  });
  fail("Unable to capture lead", error);
  if (typeof data !== "string") throw new Error("Unable to capture lead: database did not return an ID");
  return data;
}

export async function updateSupabaseLead(
  client: SupabaseClient,
  id: string,
  changes: Partial<Lead>,
): Promise<Lead | undefined> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.status !== undefined) update.status = changes.status;
  if (changes.doNotContact !== undefined) update.do_not_contact = changes.doNotContact;

  const { data, error } = await client.from("leads").update(update).eq("id", id).select("*").maybeSingle();
  fail("Unable to update lead", error);
  return data ? mapLead(data as LeadRow) : undefined;
}

export async function appendSupabaseAuditLog(
  client: SupabaseClient,
  entry: { entity: string; entityId: string; action: string; actor: string; details?: string },
) {
  const { error } = await client.from("audit_logs").insert({
    entity_type: entry.entity,
    entity_id: entry.entityId,
    action: entry.action,
    actor_label: entry.actor,
    details: entry.details ? { message: entry.details } : {},
  });
  fail("Unable to write audit log", error);
}

export async function reserveSupabaseLead(
  client: SupabaseClient,
  input: { leadId: string; buyerId: string; priceCents: number; exclusive: boolean },
): Promise<LeadAllocation> {
  const { data: allocationId, error } = await client.rpc("reserve_lead_for_buyer", {
    p_lead_id: input.leadId,
    p_buyer_id: input.buyerId,
    p_price_cents: input.priceCents,
    p_exclusive: input.exclusive,
  });
  fail("Unable to reserve lead", error);
  if (typeof allocationId !== "string") throw new Error("Unable to reserve lead: database did not return an ID");

  const { data, error: loadError } = await client
    .from("lead_allocations")
    .select("*")
    .eq("id", allocationId)
    .single();
  fail("Unable to load allocation", loadError);
  return mapAllocation(data as AllocationRow);
}
