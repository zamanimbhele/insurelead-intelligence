import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrokerMember,
  BrokerSendingIdentity,
  Buyer,
  BuyerMatchDecision,
  ConsentRecord,
  Lead,
  LeadAllocation,
} from "../types.ts";
import { INSURANCE_PRODUCTS } from "../constants.ts";

type LeadRow = {
  id: string;
  applicant_type?: "individual" | "business";
  business_name: string | null;
  trading_name: string | null;
  industry: string | null;
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
  business_cover_interests?: string[] | null;
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
  slug: string;
  organisation_type: "broker" | "insurer";
  status: Buyer["status"];
  onboarding_status: Buyer["onboardingStatus"];
  fsp_number: string | null;
  website_url: string | null;
  support_phone: string | null;
  contact_email: string;
};

type PreferenceRow = {
  organisation_id: string;
  provinces: string[];
  cities: string[];
  industries: string[];
  insurance_products: string[];
  minimum_score: number;
  daily_lead_capacity: number;
  contact_sla_hours: number;
  accepts_shared_leads: boolean;
  accepts_campaigns: boolean;
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
  responded_at: string | null;
};

type BrokerMemberRow = {
  id: string;
  organisation_id: string;
  display_name: string | null;
  job_title: string | null;
  role: BrokerMember["role"];
  member_status: BrokerMember["status"];
  created_at: string;
};

type SendingIdentityRow = {
  id: string;
  organisation_id: string;
  domain: string;
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  provider: "resend";
  status: BrokerSendingIdentity["status"];
  is_default: boolean;
  created_at: string;
};

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function optional(value: string | null | undefined) {
  return value ?? undefined;
}

export function mapLead(row: LeadRow): Lead {
  const productIds = new Set(INSURANCE_PRODUCTS.map((product) => product.value));
  const usesProductCatalogue = row.insurance_products.some((product) => productIds.has(product as Lead["insuranceProducts"][number]));
  return {
    id: row.id,
    applicantType: row.applicant_type ?? "business",
    businessName: optional(row.business_name),
    tradingName: optional(row.trading_name),
    industry: optional(row.industry),
    businessType: optional(row.business_type),
    employeeBand: optional(row.employee_band),
    turnoverBand: optional(row.turnover_band),
    yearsInOperation: optional(row.years_in_operation),
    province: row.province,
    city: row.city,
    suburb: optional(row.suburb),
    postalCode: optional(row.postal_code),
    website: optional(row.website),
    insuranceProducts: usesProductCatalogue
      ? row.insurance_products as Lead["insuranceProducts"]
      : ["business_insurance"],
    businessCoverInterests: row.business_cover_interests as Lead["businessCoverInterests"]
      ?? (usesProductCatalogue ? [] : row.insurance_products as Lead["businessCoverInterests"]),
    currentInsuranceStatus: (row.current_insurance_status ?? "unsure") as Lead["currentInsuranceStatus"],
    renewalMonth: optional(row.renewal_month),
    financialYearEndMonth: optional(row.financial_year_end_month),
    mainConcern: optional(row.main_concern),
    preferredContactTime: optional(row.preferred_contact_time),
    preferredContactChannel: (row.preferred_contact_channel ?? "email") as Lead["preferredContactChannel"],
    contactFullName: row.contact_full_name,
    contactRole: optional(row.contact_role),
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
    respondedAt: optional(row.responded_at),
  };
}

function mapBrokerMember(row: BrokerMemberRow): BrokerMember {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    displayName: optional(row.display_name),
    jobTitle: optional(row.job_title),
    role: row.role,
    status: row.member_status,
    createdAt: row.created_at,
  };
}

function mapSendingIdentity(row: SendingIdentityRow): BrokerSendingIdentity {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    domain: row.domain,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyToEmail: optional(row.reply_to_email),
    provider: row.provider,
    status: row.status,
    isDefault: row.is_default,
    createdAt: row.created_at,
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

export async function checkSupabaseHealth(client: SupabaseClient) {
  const { error } = await client.from("leads").select("id").limit(1);
  fail("Unable to reach the lead data store", error);
}

export async function checkSupabaseRateLimitHealth(client: SupabaseClient) {
  const { error } = await client.from("lead_submission_windows").select("key_hash").limit(1);
  fail("Unable to reach the durable rate-limit store", error);
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
      .select("id, name, slug, organisation_type, status, onboarding_status, fsp_number, website_url, support_phone, contact_email")
      .in("organisation_type", ["broker", "insurer"]),
    client.from("buyer_preferences").select(
      "organisation_id, provinces, cities, industries, insurance_products, minimum_score, daily_lead_capacity, contact_sla_hours, accepts_shared_leads, accepts_campaigns",
    ),
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
      slug: organisation.slug,
      buyerType: organisation.organisation_type,
      status: organisation.status,
      onboardingStatus: organisation.onboarding_status,
      fspNumber: optional(organisation.fsp_number),
      websiteUrl: optional(organisation.website_url),
      supportPhone: optional(organisation.support_phone),
      provinces: preference?.provinces ?? [],
      cities: preference?.cities ?? [],
      industries: preference?.industries ?? [],
      insuranceProducts: (preference?.insurance_products ?? []) as Buyer["insuranceProducts"],
      minimumScore: preference?.minimum_score ?? 0,
      dailyLeadCapacity: preference?.daily_lead_capacity ?? 25,
      contactSlaHours: preference?.contact_sla_hours ?? 24,
      acceptsSharedLeads: preference?.accepts_shared_leads ?? false,
      acceptsCampaigns: preference?.accepts_campaigns ?? false,
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

export async function fetchSupabaseBrokerMembers(
  client: SupabaseClient,
  organisationId: string,
): Promise<BrokerMember[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, organisation_id, display_name, job_title, role, member_status, created_at")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: true });
  fail("Unable to load broker members", error);
  return ((data ?? []) as BrokerMemberRow[]).map(mapBrokerMember);
}

export async function fetchSupabaseSendingIdentities(
  client: SupabaseClient,
  organisationId?: string,
): Promise<BrokerSendingIdentity[]> {
  let query = client
    .from("broker_sending_identities")
    .select("id, organisation_id, domain, from_name, from_email, reply_to_email, provider, status, is_default, created_at")
    .order("created_at", { ascending: true });
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query;
  fail("Unable to load broker sending identities", error);
  return ((data ?? []) as SendingIdentityRow[]).map(mapSendingIdentity);
}

export async function evaluateSupabaseLeadBuyerMatch(
  client: SupabaseClient,
  input: { leadId: string; buyerId: string; source: string },
): Promise<BuyerMatchDecision> {
  const { data, error } = await client.rpc("evaluate_lead_buyer_match", {
    p_lead_id: input.leadId,
    p_buyer_id: input.buyerId,
    p_source: input.source,
  });
  fail("Unable to evaluate buyer match", error);
  const decision = data as {
    leadId?: string;
    buyerId?: string;
    matched?: boolean;
    reasons?: string[];
  } | null;
  if (!decision || typeof decision.matched !== "boolean") {
    throw new Error("Unable to evaluate buyer match: database did not return a decision");
  }
  return {
    leadId: decision.leadId ?? input.leadId,
    buyerId: decision.buyerId ?? input.buyerId,
    matched: decision.matched,
    reasons: decision.reasons ?? [],
  };
}

export async function respondToSupabaseAllocation(
  client: SupabaseClient,
  input: { allocationId: string; decision: "accepted" | "released" },
) {
  const { data, error } = await client.rpc("respond_to_lead_allocation", {
    p_allocation_id: input.allocationId,
    p_decision: input.decision,
  });
  fail("Unable to respond to allocation", error);
  return data as { allocationId: string; leadId: string; status: "accepted" | "released" };
}

export async function hasRecentSupabaseDuplicate(
  client: SupabaseClient,
  email: string,
  businessName?: string,
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("leads")
    .select("business_name")
    .eq("contact_email", email.toLowerCase())
    .gte("created_at", since)
    .limit(20);
  fail("Unable to check duplicate lead", error);
  if (!businessName) return (data ?? []).length > 0;
  return (data ?? []).some((row) =>
    String(row.business_name ?? "").toLowerCase() === businessName.toLowerCase()
  );
}

export async function checkSupabaseSubmissionRateLimit(
  client: SupabaseClient,
  input: { keyHash: string; maximumRequests: number; windowSeconds: number },
) {
  const { data, error } = await client.rpc("check_lead_submission_rate_limit", {
    p_key_hash: input.keyHash,
    p_limit: input.maximumRequests,
    p_window_seconds: input.windowSeconds,
  });
  fail("Unable to enforce lead submission rate limit", error);
  if (typeof data !== "boolean") {
    throw new Error("Unable to enforce lead submission rate limit: database did not return a decision");
  }
  return data;
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
