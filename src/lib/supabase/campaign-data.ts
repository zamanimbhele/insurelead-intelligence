import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Campaign,
  CampaignContentVersion,
  CampaignEvent,
  CampaignRecipient,
  MarketingSuppression,
} from "../types.ts";

type CampaignRow = {
  id: string;
  organisation_id: string;
  name: string;
  objective: Campaign["objective"];
  insurance_products: Campaign["insuranceProducts"];
  audience_rules: Campaign["audienceRules"];
  contact_basis: Campaign["contactBasis"];
  sending_identity_id: string | null;
  status: Campaign["status"];
  current_content_version: number | null;
  approved_content_version: number | null;
  created_by_label: string;
  approved_by_label: string | null;
  approved_at: string | null;
  scheduled_at: string | null;
  launched_at: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
};

type ContentRow = {
  id: string;
  campaign_id: string;
  version_number: number;
  subject: string;
  preheader: string;
  html_body: string;
  text_body: string;
  generated_by_label: string;
  created_at: string;
};

type RecipientRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: CampaignRecipient["status"];
  exclusion_reason: string | null;
  provider_message_id: string | null;
  created_at: string;
  sent_at: string | null;
};

type EventRow = {
  id: string;
  campaign_id: string;
  recipient_id: string | null;
  event_type: CampaignEvent["eventType"];
  actor_label: string;
  details: Record<string, unknown>;
  occurred_at: string;
};

type SuppressionRow = {
  id: string;
  organisation_id: string;
  lead_id: string | null;
  email_hash: string;
  reason: MarketingSuppression["reason"];
  created_at: string;
};

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function optional<T>(value: T | null | undefined) {
  return value ?? undefined;
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    objective: row.objective,
    insuranceProducts: row.insurance_products,
    audienceRules: row.audience_rules ?? {},
    contactBasis: row.contact_basis,
    sendingIdentityId: optional(row.sending_identity_id),
    status: row.status,
    currentContentVersion: optional(row.current_content_version),
    approvedContentVersion: optional(row.approved_content_version),
    createdBy: row.created_by_label,
    approvedBy: optional(row.approved_by_label),
    approvedAt: optional(row.approved_at),
    scheduledAt: optional(row.scheduled_at),
    launchedAt: optional(row.launched_at),
    pausedAt: optional(row.paused_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContent(row: ContentRow): CampaignContentVersion {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    version: row.version_number,
    subject: row.subject,
    preheader: row.preheader,
    htmlBody: row.html_body,
    textBody: row.text_body,
    generatedBy: row.generated_by_label,
    createdAt: row.created_at,
  };
}

function mapRecipient(row: RecipientRow): CampaignRecipient {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    leadId: row.lead_id,
    status: row.status,
    exclusionReason: optional(row.exclusion_reason),
    providerMessageId: optional(row.provider_message_id),
    createdAt: row.created_at,
    sentAt: optional(row.sent_at),
  };
}

function mapEvent(row: EventRow): CampaignEvent {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    recipientId: optional(row.recipient_id),
    eventType: row.event_type,
    actor: row.actor_label,
    details: row.details ?? {},
    occurredAt: row.occurred_at,
  };
}

function mapSuppression(row: SuppressionRow): MarketingSuppression {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    leadId: optional(row.lead_id),
    emailHash: row.email_hash,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export async function fetchSupabaseCampaigns(client: SupabaseClient, organisationId?: string) {
  let query = client.from("campaigns").select("*").order("created_at", { ascending: false });
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query;
  fail("Unable to load campaigns", error);
  return ((data ?? []) as CampaignRow[]).map(mapCampaign);
}

export async function fetchSupabaseCampaign(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  fail("Unable to load campaign", error);
  return data ? mapCampaign(data as CampaignRow) : undefined;
}

export async function createSupabaseCampaign(
  client: SupabaseClient,
  input: Omit<Campaign, "id" | "status" | "createdAt" | "updatedAt">,
) {
  const { data, error } = await client.from("campaigns").insert({
    organisation_id: input.organisationId,
    name: input.name,
    objective: input.objective,
    insurance_products: input.insuranceProducts,
    audience_rules: input.audienceRules,
    contact_basis: input.contactBasis,
    sending_identity_id: input.sendingIdentityId ?? null,
    created_by_label: input.createdBy,
  }).select("*").single();
  fail("Unable to create campaign", error);
  return mapCampaign(data as CampaignRow);
}

export async function updateSupabaseCampaign(
  client: SupabaseClient,
  campaignId: string,
  changes: Partial<Omit<Campaign, "id" | "organisationId" | "createdAt">>,
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.status !== undefined) update.status = changes.status;
  if (changes.currentContentVersion !== undefined) update.current_content_version = changes.currentContentVersion;
  if (changes.approvedContentVersion !== undefined) update.approved_content_version = changes.approvedContentVersion;
  if (changes.approvedBy !== undefined) update.approved_by_label = changes.approvedBy;
  if (changes.approvedAt !== undefined) update.approved_at = changes.approvedAt;
  if (changes.scheduledAt !== undefined) update.scheduled_at = changes.scheduledAt;
  if (changes.launchedAt !== undefined) update.launched_at = changes.launchedAt;
  if (changes.pausedAt !== undefined) update.paused_at = changes.pausedAt;
  const { data, error } = await client.from("campaigns")
    .update(update).eq("id", campaignId).select("*").maybeSingle();
  fail("Unable to update campaign", error);
  return data ? mapCampaign(data as CampaignRow) : undefined;
}

export async function fetchSupabaseCampaignContent(
  client: SupabaseClient,
  campaignId: string,
  version?: number,
) {
  let query = client.from("campaign_content_versions").select("*").eq("campaign_id", campaignId);
  if (version !== undefined) query = query.eq("version_number", version);
  const { data, error } = await query.order("version_number", { ascending: false }).limit(1).maybeSingle();
  fail("Unable to load campaign content", error);
  return data ? mapContent(data as ContentRow) : undefined;
}

export async function saveSupabaseCampaignContent(
  client: SupabaseClient,
  campaignId: string,
  input: Omit<CampaignContentVersion, "id" | "campaignId" | "version" | "createdAt">,
) {
  const { data, error } = await client.rpc("save_campaign_content_version", {
    p_campaign_id: campaignId,
    p_subject: input.subject,
    p_preheader: input.preheader,
    p_html_body: input.htmlBody,
    p_text_body: input.textBody,
    p_generated_by_label: input.generatedBy,
  });
  fail("Unable to save campaign content", error);
  const version = Number((data as { version?: number } | null)?.version);
  if (!Number.isInteger(version)) throw new Error("Unable to save campaign content: no version returned");
  const content = await fetchSupabaseCampaignContent(client, campaignId, version);
  if (!content) throw new Error("Unable to save campaign content: version could not be loaded");
  return content;
}

export async function saveSupabaseCampaignApproval(
  client: SupabaseClient,
  input: { campaignId: string; contentVersionId: string; actor: string; attestation: string },
) {
  const { error } = await client.rpc("approve_campaign_content", {
    p_campaign_id: input.campaignId,
    p_content_version_id: input.contentVersionId,
    p_approved_by_label: input.actor,
    p_attestation: input.attestation,
  });
  fail("Unable to record campaign approval", error);
  return fetchSupabaseCampaign(client, input.campaignId);
}

export async function fetchSupabaseCampaignRecipients(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client.from("campaign_recipients")
    .select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true });
  fail("Unable to load campaign recipients", error);
  return ((data ?? []) as RecipientRow[]).map(mapRecipient);
}

export async function prepareSupabaseCampaignRecipients(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client.rpc("prepare_campaign_recipients", { p_campaign_id: campaignId });
  fail("Unable to prepare campaign recipients", error);
  return Number(data ?? 0);
}

export async function updateSupabaseCampaignRecipient(
  client: SupabaseClient,
  recipientId: string,
  changes: Partial<Pick<CampaignRecipient, "status" | "providerMessageId" | "sentAt" | "exclusionReason">>,
) {
  const update: Record<string, unknown> = {};
  if (changes.status !== undefined) update.status = changes.status;
  if (changes.providerMessageId !== undefined) update.provider_message_id = changes.providerMessageId;
  if (changes.sentAt !== undefined) update.sent_at = changes.sentAt;
  if (changes.exclusionReason !== undefined) update.exclusion_reason = changes.exclusionReason;
  const { data, error } = await client.from("campaign_recipients")
    .update(update).eq("id", recipientId).select("*").maybeSingle();
  fail("Unable to update campaign recipient", error);
  return data ? mapRecipient(data as RecipientRow) : undefined;
}

export async function appendSupabaseCampaignEvent(
  client: SupabaseClient,
  input: Omit<CampaignEvent, "id" | "occurredAt">,
) {
  const { data, error } = await client.from("campaign_delivery_events").insert({
    campaign_id: input.campaignId,
    recipient_id: input.recipientId ?? null,
    event_type: input.eventType,
    actor_label: input.actor,
    details: input.details,
  }).select("*").single();
  fail("Unable to append campaign event", error);
  return mapEvent(data as EventRow);
}

export async function fetchSupabaseCampaignEvents(client: SupabaseClient, campaignId: string) {
  const { data, error } = await client.from("campaign_delivery_events")
    .select("*").eq("campaign_id", campaignId).order("occurred_at", { ascending: false });
  fail("Unable to load campaign events", error);
  return ((data ?? []) as EventRow[]).map(mapEvent);
}

export async function fetchSupabaseMarketingSuppressions(client: SupabaseClient, organisationId: string) {
  const { data, error } = await client.from("marketing_suppressions")
    .select("id, organisation_id, lead_id, email_hash, reason, created_at")
    .eq("organisation_id", organisationId);
  fail("Unable to load marketing suppressions", error);
  return ((data ?? []) as SuppressionRow[]).map(mapSuppression);
}

export async function saveSupabaseMarketingSuppression(
  client: SupabaseClient,
  input: Omit<MarketingSuppression, "id" | "createdAt"> & { sourceCampaignId?: string },
) {
  const { data, error } = await client.from("marketing_suppressions").upsert({
    organisation_id: input.organisationId,
    lead_id: input.leadId ?? null,
    email_hash: input.emailHash,
    reason: input.reason,
    source_campaign_id: input.sourceCampaignId ?? null,
  }, { onConflict: "organisation_id,email_hash", ignoreDuplicates: true })
    .select("id, organisation_id, lead_id, email_hash, reason, created_at").maybeSingle();
  fail("Unable to save marketing suppression", error);
  if (data) return mapSuppression(data as SuppressionRow);
  const { data: existing, error: loadError } = await client.from("marketing_suppressions")
    .select("id, organisation_id, lead_id, email_hash, reason, created_at")
    .eq("organisation_id", input.organisationId)
    .eq("email_hash", input.emailHash)
    .single();
  fail("Unable to load marketing suppression", loadError);
  return mapSuppression(existing as SuppressionRow);
}
