import {
  appendCampaignContent,
  appendCampaignEvent,
  createCampaign,
  getCampaignById,
  getCampaignEvents,
  getCampaignRecipientByProviderMessageId,
  getCampaignRecipients,
  getCampaigns,
  getCurrentCampaignContent,
  claimDemoCampaignSendLease,
  getCampaignSendUsage,
  getDueCampaigns,
  getMarketingSuppressions,
  releaseDemoCampaignSendLease,
  replaceCampaignRecipients,
  saveMarketingSuppression,
  updateCampaign,
  updateCampaignRecipient,
} from "./campaign-store.ts";
import {
  mapResendWebhookEventType,
  nextRecipientStatusForWebhookEvent,
  suppressionReasonForWebhookEvent,
} from "./campaign-webhooks.ts";
import { evaluateCampaignAudience, hashCampaignEmail, validateCampaign } from "./campaign-policy.ts";
import { quotaStatus, sastPeriodStarts } from "./campaign-quota.ts";
import { pauseReason, senderReputation, warmUpDailyCap, type SenderReputation } from "./sender-reputation.ts";
import {
  getRuntimeConsent,
  getRuntimeLead,
  listRuntimeAllocations,
  listRuntimeBuyers,
  listRuntimeLeads,
  listRuntimeSendingIdentities,
  pauseRuntimeSendingIdentity,
} from "./runtime-data.ts";
import { createSupabaseAdminClient } from "./supabase/admin.ts";
import {
  appendSupabaseCampaignEvent,
  claimSupabaseCampaignSendLease,
  createSupabaseCampaign,
  fetchSupabaseCampaignSendUsage,
  fetchSupabaseDueCampaigns,
  releaseSupabaseCampaignSendLease,
  fetchSupabaseCampaign,
  fetchSupabaseCampaignContent,
  fetchSupabaseCampaignEvents,
  fetchSupabaseCampaignRecipientByProviderMessageId,
  fetchSupabaseCampaignRecipients,
  fetchSupabaseCampaigns,
  fetchSupabaseMarketingSuppressions,
  prepareSupabaseCampaignRecipients,
  saveSupabaseCampaignApproval,
  saveSupabaseCampaignContent,
  saveSupabaseMarketingSuppression,
  updateSupabaseCampaign,
  updateSupabaseCampaignRecipient,
} from "./supabase/campaign-data.ts";
import { getDataMode } from "./supabase/config.ts";
import type {
  BrokerSendingIdentity,
  Campaign,
  CampaignContentVersion,
  CampaignEvent,
  CampaignRecipient,
  MarketingSuppression,
} from "./types.ts";

function requireAdminClient() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Supabase campaign operations require the server-only secret key");
  return client;
}

export async function listRuntimeCampaigns(organisationId?: string) {
  return getDataMode() === "demo"
    ? getCampaigns(organisationId)
    : fetchSupabaseCampaigns(requireAdminClient(), organisationId);
}

export async function getRuntimeCampaign(campaignId: string) {
  return getDataMode() === "demo"
    ? getCampaignById(campaignId)
    : fetchSupabaseCampaign(requireAdminClient(), campaignId);
}

export async function createRuntimeCampaign(
  input: Omit<Campaign, "id" | "status" | "createdAt" | "updatedAt">,
) {
  if (getDataMode() === "demo") {
    const campaign = createCampaign(input);
    appendCampaignEvent({
      campaignId: campaign.id,
      eventType: "draft_created",
      actor: input.createdBy,
      details: { organisationId: input.organisationId, insuranceProducts: input.insuranceProducts },
    });
    return campaign;
  }
  const client = requireAdminClient();
  const campaign = await createSupabaseCampaign(client, input);
  await appendSupabaseCampaignEvent(client, {
    campaignId: campaign.id,
    eventType: "draft_created",
    actor: input.createdBy,
    details: { organisationId: input.organisationId, insuranceProducts: input.insuranceProducts },
  });
  return campaign;
}

export async function updateRuntimeCampaign(
  campaignId: string,
  changes: Partial<Omit<Campaign, "id" | "organisationId" | "createdAt">>,
) {
  return getDataMode() === "demo"
    ? updateCampaign(campaignId, changes)
    : updateSupabaseCampaign(requireAdminClient(), campaignId, changes);
}

export async function getRuntimeCampaignContent(campaignId: string, version?: number) {
  if (getDataMode() === "demo") {
    const current = getCurrentCampaignContent(campaignId);
    return version === undefined || current?.version === version
      ? current
      : undefined;
  }
  return fetchSupabaseCampaignContent(requireAdminClient(), campaignId, version);
}

export async function saveRuntimeCampaignContent(
  campaignId: string,
  input: Omit<CampaignContentVersion, "id" | "campaignId" | "version" | "createdAt">,
) {
  if (getDataMode() === "demo") {
    const content = appendCampaignContent(campaignId, input);
    appendCampaignEvent({
      campaignId,
      eventType: "content_generated",
      actor: input.generatedBy,
      details: { contentVersion: content.version },
    });
    return content;
  }
  return saveSupabaseCampaignContent(requireAdminClient(), campaignId, input);
}

export async function getRuntimeCampaignEvaluation(campaign: Campaign) {
  const [buyers, identities, leads, allocations, suppressions] = await Promise.all([
    listRuntimeBuyers(),
    listRuntimeSendingIdentities(campaign.organisationId),
    listRuntimeLeads(),
    listRuntimeAllocations(),
    listRuntimeMarketingSuppressions(campaign.organisationId),
  ]);
  const consents = new Map(await Promise.all(
    leads.map(async (lead) => [lead.id, await getRuntimeConsent(lead.id)] as const),
  ));
  const buyer = buyers.find((item) => item.id === campaign.organisationId);
  const sendingIdentity = identities.find((item) => item.id === campaign.sendingIdentityId);
  const content = await getRuntimeCampaignContent(campaign.id, campaign.currentContentVersion);
  const audience = evaluateCampaignAudience({ campaign, buyer, leads, consents, allocations, suppressions });
  return { buyer, sendingIdentity, content, audience, leads };
}

export async function approveRuntimeCampaign(input: {
  campaign: Campaign;
  content: CampaignContentVersion;
  actor: string;
  attestation: string;
}) {
  if (getDataMode() === "demo") {
    const approvedAt = new Date().toISOString();
    const campaign = updateCampaign(input.campaign.id, {
      status: "approved",
      approvedContentVersion: input.content.version,
      approvedBy: input.actor,
      approvedAt,
    });
    appendCampaignEvent({
      campaignId: input.campaign.id,
      eventType: "approved",
      actor: input.actor,
      details: { contentVersion: input.content.version, attestation: input.attestation },
    });
    return campaign;
  }
  const client = requireAdminClient();
  const campaign = await saveSupabaseCampaignApproval(client, {
    campaignId: input.campaign.id,
    contentVersionId: input.content.id,
    actor: input.actor,
    attestation: input.attestation,
  });
  await appendSupabaseCampaignEvent(client, {
    campaignId: input.campaign.id,
    eventType: "approved",
    actor: input.actor,
    details: { contentVersion: input.content.version, attestation: input.attestation },
  });
  return campaign;
}

export async function prepareRuntimeCampaignRecipients(campaign: Campaign) {
  if (getDataMode() === "supabase") {
    await prepareSupabaseCampaignRecipients(requireAdminClient(), campaign.id);
    return fetchSupabaseCampaignRecipients(requireAdminClient(), campaign.id);
  }
  const evaluation = await getRuntimeCampaignEvaluation(campaign);
  return replaceCampaignRecipients(
    campaign.id,
    evaluation.audience.filter((item) => item.eligible).map((item) => item.leadId),
  );
}

export async function listRuntimeCampaignRecipients(campaignId: string) {
  return getDataMode() === "demo"
    ? getCampaignRecipients(campaignId)
    : fetchSupabaseCampaignRecipients(requireAdminClient(), campaignId);
}

export async function updateRuntimeCampaignRecipient(
  recipientId: string,
  changes: Partial<Pick<CampaignRecipient, "status" | "providerMessageId" | "sentAt" | "exclusionReason">>,
) {
  return getDataMode() === "demo"
    ? updateCampaignRecipient(recipientId, changes)
    : updateSupabaseCampaignRecipient(requireAdminClient(), recipientId, changes);
}

export async function appendRuntimeCampaignEvent(
  input: Omit<CampaignEvent, "id" | "occurredAt">,
) {
  if (getDataMode() === "demo") return appendCampaignEvent(input);
  return appendSupabaseCampaignEvent(requireAdminClient(), input);
}

export async function listRuntimeCampaignEvents(campaignId: string) {
  return getDataMode() === "demo"
    ? getCampaignEvents(campaignId)
    : fetchSupabaseCampaignEvents(requireAdminClient(), campaignId);
}

export async function listRuntimeMarketingSuppressions(organisationId: string) {
  return getDataMode() === "demo"
    ? getMarketingSuppressions(organisationId)
    : fetchSupabaseMarketingSuppressions(requireAdminClient(), organisationId);
}

// Shared by the recipient-initiated unsubscribe flow and the inbound
// bounce/complaint webhook handler below - both end in exactly the same
// hashed, broker-scoped suppression record, just with a different reason
// and a different caller-chosen event to log alongside it.
async function saveRuntimeMarketingSuppression(input: {
  organisationId: string;
  leadId: string;
  reason: MarketingSuppression["reason"];
  sourceCampaignId: string;
}) {
  const lead = await getRuntimeLead(input.leadId);
  if (!lead) throw new Error("Lead not found");
  const suppressionInput = {
    organisationId: input.organisationId,
    leadId: input.leadId,
    emailHash: hashCampaignEmail(lead.contactEmail),
    reason: input.reason,
  };
  return getDataMode() === "demo"
    ? saveMarketingSuppression(suppressionInput)
    : saveSupabaseMarketingSuppression(requireAdminClient(), {
      ...suppressionInput,
      sourceCampaignId: input.sourceCampaignId,
    });
}

export async function suppressRuntimeCampaignRecipient(input: {
  organisationId: string;
  campaignId: string;
  leadId: string;
  reason: MarketingSuppression["reason"];
}) {
  const suppression = await saveRuntimeMarketingSuppression({
    organisationId: input.organisationId,
    leadId: input.leadId,
    reason: input.reason,
    sourceCampaignId: input.campaignId,
  });
  await appendRuntimeCampaignEvent({
    campaignId: input.campaignId,
    eventType: "recipient_unsubscribed",
    actor: "recipient",
    details: { leadId: input.leadId, suppressionId: suppression.id },
  });
  return suppression;
}

export async function findRuntimeCampaignRecipientByProviderMessageId(providerMessageId: string) {
  return getDataMode() === "demo"
    ? getCampaignRecipientByProviderMessageId(providerMessageId)
    : fetchSupabaseCampaignRecipientByProviderMessageId(requireAdminClient(), providerMessageId);
}

export type CampaignWebhookOutcome =
  | { outcome: "ignored" }
  | { outcome: "unmatched" }
  | { outcome: "duplicate" }
  | { outcome: "processed"; campaignId: string; recipientId: string; eventType: string; statusChanged: boolean };

/**
 * Applies one verified inbound Resend webhook event (see
 * campaign-webhooks.ts for the signature check this must run after, and the
 * route handler at src/app/api/webhooks/resend/route.ts). Idempotent per
 * Svix delivery id: Resend/Svix can and does retry a webhook delivery, so
 * before writing anything this checks whether an event already carries the
 * same svixId and, if so, returns "duplicate" without reprocessing -
 * campaign_delivery_events has no dedicated unique constraint for this (it
 * is an immutable, insert-only log, by design - see
 * reject_campaign_history_mutation() in the campaign-generation migration),
 * so the check is done by reading, not by relying on an insert conflict.
 */
export async function processRuntimeCampaignDeliveryWebhookEvent(input: {
  providerMessageId: string;
  resendEventType: string;
  svixId: string;
}): Promise<CampaignWebhookOutcome> {
  const eventType = mapResendWebhookEventType(input.resendEventType);
  if (!eventType) return { outcome: "ignored" };

  const recipient = await findRuntimeCampaignRecipientByProviderMessageId(input.providerMessageId);
  if (!recipient) return { outcome: "unmatched" };

  const existingEvents = await listRuntimeCampaignEvents(recipient.campaignId);
  const alreadyProcessed = existingEvents.some((event) => event.details?.svixId === input.svixId);
  if (alreadyProcessed) return { outcome: "duplicate" };

  const nextStatus = nextRecipientStatusForWebhookEvent(recipient.status, eventType);
  if (nextStatus) {
    await updateRuntimeCampaignRecipient(recipient.id, { status: nextStatus });
  }

  const suppressionReason = suppressionReasonForWebhookEvent(eventType);
  if (suppressionReason) {
    const campaign = await getRuntimeCampaign(recipient.campaignId);
    if (campaign) {
      await saveRuntimeMarketingSuppression({
        organisationId: campaign.organisationId,
        leadId: recipient.leadId,
        reason: suppressionReason,
        sourceCampaignId: campaign.id,
      });
    }
  }

  await appendRuntimeCampaignEvent({
    campaignId: recipient.campaignId,
    recipientId: recipient.id,
    eventType,
    actor: "resend_webhook",
    details: { svixId: input.svixId, providerMessageId: input.providerMessageId, statusChanged: Boolean(nextStatus) },
  });

  // Phase 5: a bounce or complaint may push the sender over its limits.
  if (eventType === "bounced" || eventType === "complained") {
    try {
      const campaign = await getRuntimeCampaign(recipient.campaignId);
      if (campaign?.sendingIdentityId) {
        const reason = await enforceRuntimeSenderReputation(campaign.sendingIdentityId);
        if (reason) {
          await appendRuntimeCampaignEvent({ campaignId: campaign.id, eventType: "paused", actor: "reputation_monitor", details: { reason } });
        }
      }
    } catch (error) {
      console.error("[campaigns] sender reputation check failed", error instanceof Error ? error.message : error);
    }
  }

  return {
    outcome: "processed",
    campaignId: recipient.campaignId,
    recipientId: recipient.id,
    eventType,
    statusChanged: Boolean(nextStatus),
  };
}

export async function getRuntimeCampaignPerformance(campaignId: string) {
  const [recipients, events] = await Promise.all([
    listRuntimeCampaignRecipients(campaignId),
    listRuntimeCampaignEvents(campaignId),
  ]);
  const byStatus = recipients.reduce<Record<string, number>>((counts, recipient) => {
    counts[recipient.status] = (counts[recipient.status] ?? 0) + 1;
    return counts;
  }, {});
  return {
    totalRecipients: recipients.length,
    byStatus,
    sent: byStatus.sent ?? 0,
    delivered: byStatus.delivered ?? 0,
    bounced: byStatus.bounced ?? 0,
    complained: byStatus.complained ?? 0,
    failed: byStatus.failed ?? 0,
    suppressed: byStatus.suppressed ?? 0,
    eventCount: events.length,
  };
}

// --- Scheduled sending and quotas -------------------------------------

// A platform ("via InsureLead") sender is also held to its warm-up cap
// while it is new (sender-reputation.ts).
export async function getRuntimeCampaignQuota(
  organisationId: string,
  now = new Date(),
  sendingIdentity?: Pick<BrokerSendingIdentity, "kind" | "createdAt">,
) {
  const buyer = (await listRuntimeBuyers()).find((candidate) => candidate.id === organisationId);
  const { dayStart, monthStart } = sastPeriodStarts(now);
  const usage = getDataMode() === "demo"
    ? getCampaignSendUsage(organisationId, dayStart, monthStart)
    : await fetchSupabaseCampaignSendUsage(requireAdminClient(), organisationId, dayStart, monthStart);
  const brokerDaily = buyer?.campaignDailySendLimit ?? 0;
  const warmUp = sendingIdentity?.kind === "platform" ? warmUpDailyCap(sendingIdentity.createdAt, now) : undefined;
  return {
    ...quotaStatus(
      { dailyLimit: warmUp === undefined ? brokerDaily : Math.min(brokerDaily, warmUp), monthlyLimit: buyer?.campaignMonthlySendLimit ?? 0 },
      usage,
    ),
    warmUpCap: warmUp,
  };
}

// --- Sender reputation (phase 5) ---------------------------------------

// Bounce and complaint rates for one sending identity over the last 30
// days, across every campaign that used it.
export async function getRuntimeSenderReputation(identity: Pick<BrokerSendingIdentity, "id" | "organisationId">, now = new Date()): Promise<SenderReputation> {
  const campaigns = (await listRuntimeCampaigns(identity.organisationId)).filter((campaign) => campaign.sendingIdentityId === identity.id);
  const recipients = (await Promise.all(campaigns.map((campaign) => listRuntimeCampaignRecipients(campaign.id)))).flat();
  return senderReputation(recipients, now);
}

// Pauses the identity when its rates pass the limits. The sender's own
// safety check then pauses any campaign still using it. Returns the
// reason when it paused.
export async function enforceRuntimeSenderReputation(identityId: string, now = new Date()): Promise<string | null> {
  const identity = (await listRuntimeSendingIdentities()).find((candidate) => candidate.id === identityId);
  if (!identity || identity.status === "disabled") return null;
  const reason = pauseReason(await getRuntimeSenderReputation(identity, now));
  if (!reason) return null;
  await pauseRuntimeSendingIdentity(identity.id, reason);
  return reason;
}

export async function claimRuntimeCampaignSendLease(campaignId: string, seconds: number) {
  return getDataMode() === "demo"
    ? claimDemoCampaignSendLease(campaignId, seconds)
    : claimSupabaseCampaignSendLease(requireAdminClient(), campaignId, seconds);
}

export async function releaseRuntimeCampaignSendLease(campaignId: string) {
  if (getDataMode() === "demo") return releaseDemoCampaignSendLease(campaignId);
  return releaseSupabaseCampaignSendLease(requireAdminClient(), campaignId);
}

export async function listRuntimeDueCampaigns(now: Date, limit: number) {
  return getDataMode() === "demo"
    ? getDueCampaigns(now, limit)
    : fetchSupabaseDueCampaigns(requireAdminClient(), now, limit);
}

// Send-time safety check for ONE recipient: the campaign-level validation
// (broker still approved, sender still verified, content intact) plus the
// same per-lead audience rules evaluateCampaignAudience() applies to the
// whole audience - consent, Do Not Contact, suppression, allocation,
// segment. Loads only that lead and its consent rather than re-evaluating
// the full audience for every email, which used to cost O(audience)
// queries per recipient.
export async function getRuntimeRecipientSendCheck(campaign: Campaign, leadId: string) {
  const [buyers, identities, lead, consent, allocations, suppressions, content] = await Promise.all([
    listRuntimeBuyers(),
    listRuntimeSendingIdentities(campaign.organisationId),
    getRuntimeLead(leadId),
    getRuntimeConsent(leadId),
    listRuntimeAllocations(),
    listRuntimeMarketingSuppressions(campaign.organisationId),
    getRuntimeCampaignContent(campaign.id, campaign.currentContentVersion),
  ]);
  const buyer = buyers.find((item) => item.id === campaign.organisationId);
  const sendingIdentity = identities.find((item) => item.id === campaign.sendingIdentityId);
  const audience = lead
    ? evaluateCampaignAudience({
      campaign,
      buyer,
      leads: [lead],
      consents: new Map([[lead.id, consent]]),
      allocations,
      suppressions,
    })
    : [];
  const blockingIssue = validateCampaign({ campaign, buyer, sendingIdentity, content, audience })
    .find((issue) => issue.severity === "error" && issue.code !== "audience_empty");
  return {
    lead,
    content,
    sendingIdentity,
    blockingIssue,
    eligible: audience[0]?.eligible ?? false,
    reasons: audience[0]?.reasons ?? ["Lead no longer exists"],
  };
}
