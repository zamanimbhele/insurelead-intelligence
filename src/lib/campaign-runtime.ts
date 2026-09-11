import {
  appendCampaignContent,
  appendCampaignEvent,
  createCampaign,
  getCampaignById,
  getCampaignEvents,
  getCampaignRecipients,
  getCampaigns,
  getCurrentCampaignContent,
  getMarketingSuppressions,
  replaceCampaignRecipients,
  saveMarketingSuppression,
  updateCampaign,
  updateCampaignRecipient,
} from "./campaign-store.ts";
import { evaluateCampaignAudience, hashCampaignEmail } from "./campaign-policy.ts";
import {
  getRuntimeConsent,
  getRuntimeLead,
  listRuntimeAllocations,
  listRuntimeBuyers,
  listRuntimeLeads,
  listRuntimeSendingIdentities,
} from "./runtime-data.ts";
import { createSupabaseAdminClient } from "./supabase/admin.ts";
import {
  appendSupabaseCampaignEvent,
  createSupabaseCampaign,
  fetchSupabaseCampaign,
  fetchSupabaseCampaignContent,
  fetchSupabaseCampaignEvents,
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

export async function suppressRuntimeCampaignRecipient(input: {
  organisationId: string;
  campaignId: string;
  leadId: string;
  reason: MarketingSuppression["reason"];
}) {
  const lead = await getRuntimeLead(input.leadId);
  if (!lead) throw new Error("Lead not found");
  const suppressionInput = {
    organisationId: input.organisationId,
    leadId: input.leadId,
    emailHash: hashCampaignEmail(lead.contactEmail),
    reason: input.reason,
  };
  const suppression = getDataMode() === "demo"
    ? saveMarketingSuppression(suppressionInput)
    : await saveSupabaseMarketingSuppression(requireAdminClient(), {
      ...suppressionInput,
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
