import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplicationSettings,
  BrokerMember,
  BrokerSendingIdentity,
  Buyer,
  BuyerMatchDecision,
  ConsentRecord,
  DataQualityRating,
  DataSource,
  DataSourceApprovalDecision,
  DataSourceApprovalRecord,
  DataSourceApprovalStatus,
  DataSourceCategory,
  DataSourceConsentStatus,
  DataSourceRefreshFrequency,
  DataSubjectRequest,
  DataSubjectRequestStatus,
  AuditLogEntry,
  DataSubjectRequestType,
  FinancialYearCampaignPlan,
  FyeCampaignPlanStatus,
  Lead,
  LeadActivity,
  LeadActivityKind,
  LeadAllocation,
  LeadInteractionChannel,
  LeadInteractionOutcome,
  LeadNote,
  LeadTask,
  LeadTaskStatus,
  LegalTextDocument,
  LegalTextDocumentKey,
  LegalTextDocumentVersion,
  OptOutChannel,
  OptOutRequest,
  OptOutRequestStatus,
  OptOutSource,
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
  loss_reason: string | null;
  deleted_at: string | null;
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

type ApplicationSettingsRow = {
  id: number;
  lead_retention_days: number;
  hotspot_min_lead_threshold: number;
  updated_at: string;
  updated_by: string | null;
};

type LeadNoteRow = {
  id: string;
  lead_id: string;
  author_label: string;
  body: string;
  created_at: string;
};

type LeadTaskRow = {
  id: string;
  lead_id: string;
  title: string;
  due_at: string | null;
  assignee_label: string | null;
  status: LeadTaskStatus;
  created_at: string;
  completed_at: string | null;
};

type LeadActivityRow = {
  id: string;
  lead_id: string;
  kind: LeadActivityKind;
  summary: string;
  actor_label: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

type OptOutRequestRow = {
  id: string;
  lead_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  channel: OptOutChannel;
  reason: string | null;
  source: OptOutSource;
  status: OptOutRequestStatus;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  resolution_notes: string | null;
  created_by: string;
};

type DataSubjectRequestRow = {
  id: string;
  lead_id: string | null;
  request_type: DataSubjectRequestType;
  requester_name: string;
  requester_email: string;
  requester_phone: string | null;
  details: string | null;
  status: DataSubjectRequestStatus;
  received_at: string;
  due_at: string;
  completed_at: string | null;
  handled_by: string | null;
  resolution_notes: string | null;
  created_by: string;
};

type DataSourceRow = {
  id: string;
  name: string;
  source_type: DataSourceCategory;
  owner: string;
  description: string | null;
  data_fields_received: string[];
  legal_basis: string;
  consent_status: DataSourceConsentStatus;
  licence_reference: string | null;
  retention_period_days: number | null;
  approved_use: string;
  approval_status: DataSourceApprovalStatus;
  last_reviewed_at: string | null;
  data_quality_rating: DataQualityRating;
  refresh_frequency: DataSourceRefreshFrequency;
  contains_personal_information: boolean;
  allowed_for_marketing: boolean;
  allowed_for_market_intelligence_only: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DataSourceApprovalRow = {
  id: string;
  data_source_id: string;
  decision: DataSourceApprovalDecision;
  notes: string | null;
  decided_by: string;
  decided_at: string;
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
    lossReason: optional(row.loss_reason),
    deletedAt: optional(row.deleted_at),
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

export async function reviewSupabaseOrganisation(
  client: SupabaseClient,
  input: { organisationId: string; decision: "approve" | "reject" },
) {
  const { data, error } = await client.rpc("review_broker_organisation", {
    p_organisation_id: input.organisationId,
    p_decision: input.decision,
  });
  fail("Unable to review organisation", error);
  return data as { id: string; onboardingStatus: string; status: string };
}

export async function updateSupabaseProfileMembership(
  client: SupabaseClient,
  input: { profileId: string; role: string; memberStatus: string },
) {
  const { data, error } = await client.rpc("update_profile_membership", {
    p_profile_id: input.profileId,
    p_role: input.role,
    p_member_status: input.memberStatus,
  });
  fail("Unable to update member", error);
  return data as { id: string; role: string; memberStatus: string };
}

export async function reviewSupabaseSendingIdentity(
  client: SupabaseClient,
  input: { identityId: string; status: "verified" | "disabled" },
) {
  const { data, error } = await client.rpc("review_sending_identity", {
    p_identity_id: input.identityId,
    p_status: input.status,
  });
  fail("Unable to review sending identity", error);
  return data as { id: string; status: string };
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

// audit_logs.entity_id is a uuid NOT NULL column, but a few callers (the
// retention-threshold and hotspot-threshold settings routes, and the
// audit log's own CSV export) pass a natural-language key like
// "application_settings" or "audit_log" for an action with no real row id
// of its own - inserting that string as-is fails at the database with
// "invalid input syntax for type uuid". Rather than require every caller
// to know this, mint a fresh id for the entry's own identity when
// entityId is not already uuid-shaped, and fold the original label into
// details (as plain text, not a second jsonb key, so the Audit Log
// Viewer's Details column still renders it as one readable sentence
// rather than raw JSON - see mapAuditLogEntry below).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function appendSupabaseAuditLog(
  client: SupabaseClient,
  entry: { entity: string; entityId: string; action: string; actor: string; details?: string },
): Promise<string | undefined> {
  const isRealUuid = UUID_PATTERN.test(entry.entityId);
  const message = isRealUuid
    ? entry.details
    : [entry.details, `entityKey=${entry.entityId}`].filter(Boolean).join(" ");

  const { data, error } = await client
    .from("audit_logs")
    .insert({
      entity_type: entry.entity,
      entity_id: isRealUuid ? entry.entityId : randomUUID(),
      action: entry.action,
      actor_label: entry.actor,
      details: message ? { message } : {},
    })
    .select("id")
    .single();
  fail("Unable to write audit log", error);
  return (data as { id?: string } | null)?.id;
}

type AuditLogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_label: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
};

function mapAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  // appendSupabaseAuditLog() above stores a plain-string detail as
  // {message: "..."} ; an RPC-written entry (e.g. create_data_source())
  // stores a richer jsonb object directly. Render the common single-message
  // case as plain text rather than {"message":"..."}.
  const details = row.details && Object.keys(row.details).length > 0
    ? typeof row.details.message === "string" && Object.keys(row.details).length === 1
      ? row.details.message
      : JSON.stringify(row.details)
    : undefined;

  return {
    id: row.id,
    entity: row.entity_type as AuditLogEntry["entity"],
    entityId: row.entity_id,
    action: row.action,
    actor: row.actor_label ?? "unknown",
    timestamp: row.created_at,
    details,
  };
}

// Audit Log Viewer (project brief Phase 5). Capped at `limit` most recent
// entries - filterAuditLog() in src/lib/audit-log.ts then narrows this set
// further, both for the viewer's own display and for a CSV export, which
// re-fetches and re-filters independently rather than trusting whatever a
// client happens to have in memory.
export async function fetchSupabaseAuditLog(client: SupabaseClient, limit: number): Promise<AuditLogEntry[]> {
  const { data, error } = await client
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  fail("Unable to load audit log", error);
  return ((data ?? []) as AuditLogRow[]).map(mapAuditLogEntry);
}

// Dashboard-initiated lead status changes (the Kanban board, and its
// keyboard-accessible "Move to" fallback) run through this RPC rather than
// a direct table update. Unlike updateSupabaseLead() - called only via the
// service-role admin client for MCP/server-side writes - this call carries
// the signed-in user's own session, and public.update_lead_status()
// re-checks on the database side that a platform admin or an allocated
// broker operator is making the change, keeps the Do Not Contact flag in
// sync, and writes the audit log entry itself.
export async function updateSupabaseLeadStatus(
  client: SupabaseClient,
  input: { leadId: string; status: string; lossReason?: string },
): Promise<{ leadId: string; status: string; doNotContact: boolean; lossReason?: string }> {
  const { data, error } = await client.rpc("update_lead_status", {
    p_lead_id: input.leadId,
    p_status: input.status,
    p_loss_reason: input.lossReason ?? null,
  });
  fail("Unable to update lead status", error);
  const result = data as { leadId?: string; status?: string; doNotContact?: boolean; lossReason?: string } | null;
  if (!result || typeof result.status !== "string") {
    throw new Error("Unable to update lead status: database did not return a result");
  }
  return {
    leadId: result.leadId ?? input.leadId,
    status: result.status,
    doNotContact: Boolean(result.doNotContact),
    lossReason: result.lossReason ?? undefined,
  };
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

function mapApplicationSettings(row: ApplicationSettingsRow): ApplicationSettings {
  return {
    leadRetentionDays: row.lead_retention_days,
    hotspotMinLeadThreshold: row.hotspot_min_lead_threshold,
    updatedAt: row.updated_at,
    updatedBy: optional(row.updated_by),
  };
}

export async function fetchSupabaseApplicationSettings(client: SupabaseClient): Promise<ApplicationSettings> {
  const { data, error } = await client.from("application_settings").select("*").eq("id", 1).maybeSingle();
  fail("Unable to load application settings", error);
  // The seed row ships in the migration, but fall back sensibly if a fresh
  // environment somehow skipped it rather than erroring the whole dashboard.
  if (!data) return { leadRetentionDays: 730, hotspotMinLeadThreshold: 10 };
  return mapApplicationSettings(data as ApplicationSettingsRow);
}

export async function updateSupabaseApplicationSettings(
  client: SupabaseClient,
  input: { leadRetentionDays?: number; hotspotMinLeadThreshold?: number; updatedBy?: string },
): Promise<ApplicationSettings> {
  const updatePayload: Record<string, unknown> = { updated_by: input.updatedBy ?? null, updated_at: new Date().toISOString() };
  if (input.leadRetentionDays !== undefined) updatePayload.lead_retention_days = input.leadRetentionDays;
  if (input.hotspotMinLeadThreshold !== undefined) updatePayload.hotspot_min_lead_threshold = input.hotspotMinLeadThreshold;

  const { data, error } = await client
    .from("application_settings")
    .update(updatePayload)
    .eq("id", 1)
    .select("*")
    .single();
  fail("Unable to update application settings", error);
  return mapApplicationSettings(data as ApplicationSettingsRow);
}

// --- Broker workflow: notes, call/email/meeting logging, follow-up tasks,
// and the unified activity timeline. Writes all go through the
// SECURITY DEFINER RPCs in 202610030002_lead_activity_workflow.sql, not a
// direct table insert/update, for the same reason update_lead_status() is
// an RPC: the authenticated role has select-only access to these tables.

function mapLeadNote(row: LeadNoteRow): LeadNote {
  return { id: row.id, leadId: row.lead_id, authorLabel: row.author_label, body: row.body, createdAt: row.created_at };
}

function mapLeadTask(row: LeadTaskRow): LeadTask {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    dueAt: optional(row.due_at),
    assigneeLabel: optional(row.assignee_label),
    status: row.status,
    createdAt: row.created_at,
    completedAt: optional(row.completed_at),
  };
}

function mapLeadActivity(row: LeadActivityRow): LeadActivity {
  return {
    id: row.id,
    leadId: row.lead_id,
    kind: row.kind,
    summary: row.summary,
    actorLabel: row.actor_label,
    occurredAt: row.occurred_at,
    metadata: row.metadata ?? undefined,
  };
}

export async function fetchSupabaseLeadNotes(client: SupabaseClient, leadId: string): Promise<LeadNote[]> {
  const { data, error } = await client
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  fail("Unable to load lead notes", error);
  return ((data ?? []) as LeadNoteRow[]).map(mapLeadNote);
}

export async function fetchSupabaseLeadTasks(client: SupabaseClient, leadId: string): Promise<LeadTask[]> {
  const { data, error } = await client
    .from("lead_tasks")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  fail("Unable to load lead tasks", error);
  return ((data ?? []) as LeadTaskRow[]).map(mapLeadTask);
}

export async function fetchSupabaseLeadActivities(client: SupabaseClient, leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await client
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });
  fail("Unable to load lead activity timeline", error);
  return ((data ?? []) as LeadActivityRow[]).map(mapLeadActivity);
}

export async function addSupabaseLeadNote(client: SupabaseClient, input: { leadId: string; body: string }) {
  const { data, error } = await client.rpc("add_lead_note", { p_lead_id: input.leadId, p_body: input.body });
  fail("Unable to add note", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to add note: database did not return an ID");
  return result.id;
}

export async function logSupabaseLeadInteraction(
  client: SupabaseClient,
  input: { leadId: string; channel: LeadInteractionChannel; outcome: LeadInteractionOutcome; summary: string },
) {
  const { data, error } = await client.rpc("log_lead_interaction", {
    p_lead_id: input.leadId,
    p_channel: input.channel,
    p_outcome: input.outcome,
    p_summary: input.summary,
  });
  fail("Unable to log interaction", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to log interaction: database did not return an ID");
  return result.id;
}

export async function createSupabaseLeadTask(
  client: SupabaseClient,
  input: { leadId: string; title: string; dueAt?: string; assigneeLabel?: string },
) {
  const { data, error } = await client.rpc("create_lead_task", {
    p_lead_id: input.leadId,
    p_title: input.title,
    p_due_at: input.dueAt ?? null,
    p_assignee_label: input.assigneeLabel ?? null,
  });
  fail("Unable to create task", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to create task: database did not return an ID");
  return result.id;
}

export async function completeSupabaseLeadTask(
  client: SupabaseClient,
  input: { taskId: string; status: Extract<LeadTaskStatus, "completed" | "cancelled"> },
) {
  const { data, error } = await client.rpc("complete_lead_task", { p_task_id: input.taskId, p_status: input.status });
  fail("Unable to update task", error);
  const result = data as { id?: string; status?: string } | null;
  if (!result?.id) throw new Error("Unable to update task: database did not return an ID");
  return result.id;
}

// --- Compliance: opt-out requests and data subject access/correction/
// deletion requests. Writes all go through the SECURITY DEFINER RPCs in
// 202610030003_opt_out_and_data_subject_requests.sql, not a direct table
// insert/update - the authenticated role has select-only access to both
// tables.

function mapOptOutRequest(row: OptOutRequestRow): OptOutRequest {
  return {
    id: row.id,
    leadId: optional(row.lead_id),
    contactName: optional(row.contact_name),
    contactEmail: optional(row.contact_email),
    contactPhone: optional(row.contact_phone),
    channel: row.channel,
    reason: optional(row.reason),
    source: row.source,
    status: row.status,
    requestedAt: row.requested_at,
    processedAt: optional(row.processed_at),
    processedBy: optional(row.processed_by),
    resolutionNotes: optional(row.resolution_notes),
    createdBy: row.created_by,
  };
}

function mapDataSubjectRequest(row: DataSubjectRequestRow): DataSubjectRequest {
  return {
    id: row.id,
    leadId: optional(row.lead_id),
    requestType: row.request_type,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    requesterPhone: optional(row.requester_phone),
    details: optional(row.details),
    status: row.status,
    receivedAt: row.received_at,
    dueAt: row.due_at,
    completedAt: optional(row.completed_at),
    handledBy: optional(row.handled_by),
    resolutionNotes: optional(row.resolution_notes),
    createdBy: row.created_by,
  };
}

export async function fetchSupabaseOptOutRequests(client: SupabaseClient): Promise<OptOutRequest[]> {
  const { data, error } = await client
    .from("opt_out_requests")
    .select("*")
    .order("requested_at", { ascending: false });
  fail("Unable to load opt-out requests", error);
  return ((data ?? []) as OptOutRequestRow[]).map(mapOptOutRequest);
}

export async function fetchSupabaseDataSubjectRequests(client: SupabaseClient): Promise<DataSubjectRequest[]> {
  const { data, error } = await client
    .from("data_subject_requests")
    .select("*")
    .order("received_at", { ascending: false });
  fail("Unable to load data subject requests", error);
  return ((data ?? []) as DataSubjectRequestRow[]).map(mapDataSubjectRequest);
}

export async function createSupabaseOptOutRequest(
  client: SupabaseClient,
  input: {
    channel: OptOutChannel;
    source: OptOutSource;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    reason?: string;
    leadId?: string;
  },
) {
  const { data, error } = await client.rpc("create_opt_out_request", {
    p_channel: input.channel,
    p_source: input.source,
    p_contact_name: input.contactName ?? null,
    p_contact_email: input.contactEmail ?? null,
    p_contact_phone: input.contactPhone ?? null,
    p_reason: input.reason ?? null,
    p_lead_id: input.leadId ?? null,
  });
  fail("Unable to log opt-out request", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to log opt-out request: database did not return an ID");
  return result.id;
}

export async function processSupabaseOptOutRequest(
  client: SupabaseClient,
  input: { requestId: string; resolutionNotes?: string },
) {
  const { data, error } = await client.rpc("process_opt_out_request", {
    p_request_id: input.requestId,
    p_resolution_notes: input.resolutionNotes ?? null,
  });
  fail("Unable to process opt-out request", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to process opt-out request: database did not return an ID");
  return result.id;
}

export async function createSupabaseDataSubjectRequest(
  client: SupabaseClient,
  input: {
    requestType: DataSubjectRequestType;
    requesterName: string;
    requesterEmail: string;
    requesterPhone?: string;
    details?: string;
    leadId?: string;
  },
) {
  const { data, error } = await client.rpc("create_data_subject_request", {
    p_request_type: input.requestType,
    p_requester_name: input.requesterName,
    p_requester_email: input.requesterEmail,
    p_requester_phone: input.requesterPhone ?? null,
    p_details: input.details ?? null,
    p_lead_id: input.leadId ?? null,
  });
  fail("Unable to log data subject request", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to log data subject request: database did not return an ID");
  return result.id;
}

export async function updateSupabaseDataSubjectRequestStatus(
  client: SupabaseClient,
  input: {
    requestId: string;
    status: Extract<DataSubjectRequestStatus, "verifying" | "in_progress" | "completed" | "rejected">;
    resolutionNotes?: string;
  },
) {
  const { data, error } = await client.rpc("update_data_subject_request_status", {
    p_request_id: input.requestId,
    p_status: input.status,
    p_resolution_notes: input.resolutionNotes ?? null,
  });
  fail("Unable to update data subject request", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to update data subject request: database did not return an ID");
  return result.id;
}

// --- Data Source Registry. Every write goes through a SECURITY DEFINER
// RPC in supabase/migrations/202610040001_data_source_registry.sql, not
// a direct table insert/update - the authenticated role has select-only
// access to both tables.

function mapDataSource(row: DataSourceRow): DataSource {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    owner: row.owner,
    description: optional(row.description),
    dataFieldsReceived: row.data_fields_received ?? [],
    legalBasis: row.legal_basis,
    consentStatus: row.consent_status,
    licenceReference: optional(row.licence_reference),
    retentionPeriodDays: row.retention_period_days ?? undefined,
    approvedUse: row.approved_use,
    approvalStatus: row.approval_status,
    lastReviewedAt: optional(row.last_reviewed_at),
    dataQualityRating: row.data_quality_rating,
    refreshFrequency: row.refresh_frequency,
    containsPersonalInformation: row.contains_personal_information,
    allowedForMarketing: row.allowed_for_marketing,
    allowedForMarketIntelligenceOnly: row.allowed_for_market_intelligence_only,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDataSourceApproval(row: DataSourceApprovalRow): DataSourceApprovalRecord {
  return {
    id: row.id,
    dataSourceId: row.data_source_id,
    decision: row.decision,
    notes: optional(row.notes),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
  };
}

export async function fetchSupabaseDataSources(client: SupabaseClient): Promise<DataSource[]> {
  const { data, error } = await client
    .from("data_sources")
    .select("*")
    .order("created_at", { ascending: false });
  fail("Unable to load data sources", error);
  return ((data ?? []) as DataSourceRow[]).map(mapDataSource);
}

export async function fetchSupabaseDataSourceApprovals(client: SupabaseClient, dataSourceId?: string): Promise<DataSourceApprovalRecord[]> {
  let query = client.from("data_source_approvals").select("*").order("decided_at", { ascending: false });
  if (dataSourceId) query = query.eq("data_source_id", dataSourceId);
  const { data, error } = await query;
  fail("Unable to load data source approval history", error);
  return ((data ?? []) as DataSourceApprovalRow[]).map(mapDataSourceApproval);
}

export async function createSupabaseDataSource(
  client: SupabaseClient,
  input: {
    name: string;
    sourceType: DataSourceCategory;
    owner: string;
    legalBasis: string;
    consentStatus: DataSourceConsentStatus;
    approvedUse: string;
    description?: string;
    dataFieldsReceived?: string[];
    licenceReference?: string;
    retentionPeriodDays?: number;
    dataQualityRating?: DataQualityRating;
    refreshFrequency?: DataSourceRefreshFrequency;
    containsPersonalInformation?: boolean;
    allowedForMarketIntelligenceOnly?: boolean;
  },
) {
  const { data, error } = await client.rpc("create_data_source", {
    p_name: input.name,
    p_source_type: input.sourceType,
    p_owner: input.owner,
    p_legal_basis: input.legalBasis,
    p_consent_status: input.consentStatus,
    p_approved_use: input.approvedUse,
    p_description: input.description ?? null,
    p_data_fields_received: input.dataFieldsReceived ?? [],
    p_licence_reference: input.licenceReference ?? null,
    p_retention_period_days: input.retentionPeriodDays ?? null,
    p_data_quality_rating: input.dataQualityRating ?? "unrated",
    p_refresh_frequency: input.refreshFrequency ?? "one_off",
    p_contains_personal_information: input.containsPersonalInformation ?? false,
    p_allowed_for_market_intelligence_only: input.allowedForMarketIntelligenceOnly ?? false,
  });
  fail("Unable to register data source", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to register data source: database did not return an ID");
  return result.id;
}

export async function updateSupabaseDataSource(
  client: SupabaseClient,
  input: {
    dataSourceId: string;
    name?: string;
    owner?: string;
    description?: string;
    dataFieldsReceived?: string[];
    legalBasis?: string;
    consentStatus?: DataSourceConsentStatus;
    licenceReference?: string;
    retentionPeriodDays?: number;
    approvedUse?: string;
    dataQualityRating?: DataQualityRating;
    refreshFrequency?: DataSourceRefreshFrequency;
    containsPersonalInformation?: boolean;
    allowedForMarketIntelligenceOnly?: boolean;
  },
) {
  const { data, error } = await client.rpc("update_data_source", {
    p_data_source_id: input.dataSourceId,
    p_name: input.name ?? null,
    p_owner: input.owner ?? null,
    p_description: input.description ?? null,
    p_data_fields_received: input.dataFieldsReceived ?? null,
    p_legal_basis: input.legalBasis ?? null,
    p_consent_status: input.consentStatus ?? null,
    p_licence_reference: input.licenceReference ?? null,
    p_retention_period_days: input.retentionPeriodDays ?? null,
    p_approved_use: input.approvedUse ?? null,
    p_data_quality_rating: input.dataQualityRating ?? null,
    p_refresh_frequency: input.refreshFrequency ?? null,
    p_contains_personal_information: input.containsPersonalInformation ?? null,
    p_allowed_for_market_intelligence_only: input.allowedForMarketIntelligenceOnly ?? null,
  });
  fail("Unable to update data source", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to update data source: database did not return an ID");
  return result.id;
}

export async function decideSupabaseDataSourceApproval(
  client: SupabaseClient,
  input: { dataSourceId: string; decision: DataSourceApprovalDecision; notes?: string; allowedForMarketing?: boolean },
) {
  const { data, error } = await client.rpc("decide_data_source_approval", {
    p_data_source_id: input.dataSourceId,
    p_decision: input.decision,
    p_notes: input.notes ?? null,
    p_allowed_for_marketing: input.allowedForMarketing ?? false,
  });
  fail("Unable to record the data source approval decision", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to record the data source approval decision: database did not return an ID");
  return result.id;
}

// --- Financial-Year-End Campaign Planner. Every write goes through a
// SECURITY DEFINER RPC in
// supabase/migrations/202610060001_fye_campaign_planner.sql, not a direct
// table insert/update - the authenticated role has select-only access.

type FinancialYearCampaignPlanRow = {
  id: string;
  title: string;
  fye_month: string;
  planned_contact_month: string;
  notes: string | null;
  status: FyeCampaignPlanStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function mapFinancialYearCampaignPlan(row: FinancialYearCampaignPlanRow): FinancialYearCampaignPlan {
  return {
    id: row.id,
    title: row.title,
    fyeMonth: row.fye_month,
    plannedContactMonth: row.planned_contact_month,
    notes: optional(row.notes),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSupabaseFyeCampaignPlans(client: SupabaseClient): Promise<FinancialYearCampaignPlan[]> {
  const { data, error } = await client
    .from("financial_year_calendars")
    .select("*")
    .order("created_at", { ascending: false });
  fail("Unable to load FYE campaign plans", error);
  return ((data ?? []) as FinancialYearCampaignPlanRow[]).map(mapFinancialYearCampaignPlan);
}

export async function createSupabaseFyeCampaignPlan(
  client: SupabaseClient,
  input: { title: string; fyeMonth: string; plannedContactMonth: string; notes?: string },
) {
  const { data, error } = await client.rpc("create_fye_campaign_plan", {
    p_title: input.title,
    p_fye_month: input.fyeMonth,
    p_planned_contact_month: input.plannedContactMonth,
    p_notes: input.notes ?? null,
  });
  fail("Unable to create campaign plan", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to create campaign plan: database did not return an ID");
  return result.id;
}

export async function updateSupabaseFyeCampaignPlanStatus(
  client: SupabaseClient,
  input: { planId: string; status: FyeCampaignPlanStatus },
) {
  const { data, error } = await client.rpc("update_fye_campaign_plan_status", {
    p_plan_id: input.planId,
    p_status: input.status,
  });
  fail("Unable to update campaign plan status", error);
  const result = data as { id?: string } | null;
  if (!result?.id) throw new Error("Unable to update campaign plan status: database did not return an ID");
  return result.id;
}

// --- Configurable legal-text fields (project brief section 2). Reads are
// plain selects (RLS: authenticated may select both tables - see
// supabase/migrations/202610080001_legal_text_documents.sql); the only
// write path is the update_legal_text_document() SECURITY DEFINER RPC,
// which re-checks the caller's role itself, bumps the version, appends to
// legal_text_document_versions, and writes its own audit_logs entry -
// never a direct table update from here.

type LegalTextDocumentRow = {
  document_key: LegalTextDocumentKey;
  title: string;
  content: string;
  version: number;
  updated_by: string;
  updated_at: string;
};

type LegalTextDocumentVersionRow = {
  document_key: LegalTextDocumentKey;
  version: number;
  content: string;
  updated_by: string;
  created_at: string;
};

function mapLegalTextDocument(row: LegalTextDocumentRow): LegalTextDocument {
  return {
    documentKey: row.document_key,
    title: row.title,
    content: row.content,
    version: row.version,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function mapLegalTextDocumentVersion(row: LegalTextDocumentVersionRow): LegalTextDocumentVersion {
  return {
    documentKey: row.document_key,
    version: row.version,
    content: row.content,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
  };
}

export async function fetchSupabaseLegalTextDocuments(client: SupabaseClient): Promise<LegalTextDocument[]> {
  const { data, error } = await client.from("legal_text_documents").select("*").order("document_key", { ascending: true });
  fail("Unable to load legal text documents", error);
  return ((data ?? []) as LegalTextDocumentRow[]).map(mapLegalTextDocument);
}

export async function fetchSupabaseLegalTextDocumentVersions(
  client: SupabaseClient,
  documentKey: LegalTextDocumentKey,
): Promise<LegalTextDocumentVersion[]> {
  const { data, error } = await client
    .from("legal_text_document_versions")
    .select("*")
    .eq("document_key", documentKey)
    .order("version", { ascending: false });
  fail("Unable to load legal text document history", error);
  return ((data ?? []) as LegalTextDocumentVersionRow[]).map(mapLegalTextDocumentVersion);
}

export async function updateSupabaseLegalTextDocument(
  client: SupabaseClient,
  input: { documentKey: LegalTextDocumentKey; content: string },
): Promise<LegalTextDocument> {
  const { data, error } = await client.rpc("update_legal_text_document", {
    p_document_key: input.documentKey,
    p_content: input.content,
  });
  fail("Unable to update legal text document", error);
  const result = data as { documentKey?: string; title?: string; content?: string; version?: number; updatedBy?: string; updatedAt?: string } | null;
  if (!result?.documentKey) throw new Error("Unable to update legal text document: database did not return the saved document");
  return {
    documentKey: result.documentKey as LegalTextDocumentKey,
    title: result.title ?? "",
    content: result.content ?? "",
    version: result.version ?? 1,
    updatedBy: result.updatedBy ?? "",
    updatedAt: result.updatedAt ?? new Date().toISOString(),
  };
}
