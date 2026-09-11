import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getCampaignDeliveryMode, sendCampaignEmail } from "../lib/campaign-delivery.ts";
import {
  generateCampaignCopy,
  renderCampaignContent,
  summariseAudience,
  validateCampaign,
} from "../lib/campaign-policy.ts";
import {
  appendRuntimeCampaignEvent,
  approveRuntimeCampaign,
  createRuntimeCampaign,
  getRuntimeCampaign,
  getRuntimeCampaignEvaluation,
  getRuntimeCampaignPerformance,
  listRuntimeCampaignRecipients,
  listRuntimeCampaigns,
  prepareRuntimeCampaignRecipients,
  saveRuntimeCampaignContent,
  updateRuntimeCampaign,
  updateRuntimeCampaignRecipient,
} from "../lib/campaign-runtime.ts";
import { createCampaignUnsubscribeUrl } from "../lib/campaign-unsubscribe.ts";
import {
  getRuntimeLead,
  listRuntimeBuyers,
  listRuntimeSendingIdentities,
} from "../lib/runtime-data.ts";
import { getDataMode } from "../lib/supabase/config.ts";
import type { Campaign, InsuranceProduct } from "../lib/types.ts";

const productSchema = z.enum([
  "motor_insurance",
  "home_contents_insurance",
  "life_insurance",
  "funeral_cover",
  "travel_insurance",
  "personal_accident",
  "business_insurance",
  "general_insurance_review",
]);
const objectiveSchema = z.enum([
  "awareness",
  "renewal_reminder",
  "cross_sell",
  "quote_follow_up",
  "seasonal",
]);
const actorRoleSchema = z.enum([
  "platform_admin",
  "broker_admin",
  "campaign_manager",
  "read_only",
]);

type CampaignActor = {
  role: z.infer<typeof actorRoleSchema>;
  organisationId?: string;
  label: string;
};

function campaignResult<T>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function getActor(): CampaignActor {
  const configuredRole = process.env.INSURELEAD_MCP_ACTOR_ROLE?.trim();
  const role = configuredRole
    ? actorRoleSchema.parse(configuredRole)
    : getDataMode() === "demo" ? "platform_admin" : "read_only";
  return {
    role,
    organisationId: process.env.INSURELEAD_MCP_ORGANISATION_ID?.trim() || undefined,
    label: process.env.INSURELEAD_MCP_ACTOR_LABEL?.trim() || `mcp_${role}`,
  };
}

function resolveOrganisation(actor: CampaignActor, requested?: string) {
  if (actor.role === "platform_admin") {
    if (!requested) throw new Error("organisationId is required for a platform campaign operation");
    return requested;
  }
  if (!actor.organisationId) throw new Error("INSURELEAD_MCP_ORGANISATION_ID is required");
  if (requested && requested !== actor.organisationId) throw new Error("Campaign belongs to another tenant");
  return actor.organisationId;
}

function assertWritesEnabled() {
  if (getDataMode() !== "demo" && process.env.INSURELEAD_MCP_ALLOW_WRITES !== "true") {
    throw new Error("Production MCP writes are disabled");
  }
}

function assertCanCreate(actor: CampaignActor) {
  if (!(["platform_admin", "broker_admin", "campaign_manager"] as const).includes(
    actor.role as "platform_admin" | "broker_admin" | "campaign_manager",
  )) throw new Error("This MCP actor cannot manage campaigns");
}

function assertCanApprove(actor: CampaignActor) {
  if (!(["platform_admin", "broker_admin"] as const).includes(
    actor.role as "platform_admin" | "broker_admin",
  )) throw new Error("Campaign approval requires a broker administrator or platform administrator");
}

async function loadAccessibleCampaign(campaignId: string, actor: CampaignActor) {
  const campaign = await getRuntimeCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  resolveOrganisation(actor, campaign.organisationId);
  return campaign;
}

function safeCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    organisationId: campaign.organisationId,
    name: campaign.name,
    objective: campaign.objective,
    insuranceProducts: campaign.insuranceProducts,
    audienceRules: campaign.audienceRules,
    contactBasis: campaign.contactBasis,
    sendingIdentityId: campaign.sendingIdentityId,
    status: campaign.status,
    currentContentVersion: campaign.currentContentVersion,
    approvedContentVersion: campaign.approvedContentVersion,
    approvedBy: campaign.approvedBy,
    approvedAt: campaign.approvedAt,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

export function registerCampaignTools(server: McpServer) {
  server.registerTool(
    "list_eligible_brokers",
    {
      title: "List campaign-enabled brokers",
      description: "List approved broker tenants and their product and sender readiness for campaigns.",
      inputSchema: { insuranceProducts: z.array(productSchema).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ insuranceProducts }) => {
      try {
        const actor = getActor();
        const [buyers, identities] = await Promise.all([
          listRuntimeBuyers(),
          listRuntimeSendingIdentities(),
        ]);
        const brokers = buyers
          .filter((buyer) => actor.role === "platform_admin" || buyer.id === actor.organisationId)
          .filter((buyer) => !insuranceProducts?.length
            || insuranceProducts.every((product) => buyer.insuranceProducts.includes(product)))
          .map((buyer) => {
            const senders = identities.filter((identity) => identity.organisationId === buyer.id);
            const issues = [
              ...(buyer.status === "active" && buyer.onboardingStatus === "approved" ? [] : ["Broker is not active and approved"]),
              ...(buyer.acceptsCampaigns ? [] : ["Campaign permission is disabled"]),
              ...(senders.some((identity) => identity.status === "verified") ? [] : ["No verified sending identity"]),
            ];
            return {
              id: buyer.id,
              organisationName: buyer.organisationName,
              insuranceProducts: buyer.insuranceProducts,
              campaignReady: issues.length === 0,
              issues,
              verifiedSendingIdentities: senders.filter((identity) => identity.status === "verified")
                .map((identity) => ({ id: identity.id, fromName: identity.fromName, fromEmail: identity.fromEmail })),
            };
          });
        return campaignResult({ count: brokers.length, brokers });
      } catch (error) {
        return campaignResult({ count: 0, brokers: [], error: error instanceof Error ? error.message : "Unable to list brokers" });
      }
    },
  );

  server.registerTool(
    "list_campaigns",
    {
      title: "List campaigns",
      description: "List campaigns visible to the configured platform or broker tenant context.",
      inputSchema: { organisationId: z.string().min(1).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ organisationId }) => {
      try {
        const actor = getActor();
        const resolved = actor.role === "platform_admin"
          ? organisationId
          : resolveOrganisation(actor, organisationId);
        const campaigns = (await listRuntimeCampaigns(resolved)).map(safeCampaign);
        return campaignResult({ count: campaigns.length, campaigns });
      } catch (error) {
        return campaignResult({ count: 0, campaigns: [], error: error instanceof Error ? error.message : "Unable to list campaigns" });
      }
    },
  );

  server.registerTool(
    "create_campaign_draft",
    {
      title: "Create a campaign draft",
      description: "Create a tenant-owned campaign brief. This tool never generates content or sends messages.",
      inputSchema: {
        organisationId: z.string().min(1).optional(),
        name: z.string().min(3).max(120),
        objective: objectiveSchema,
        insuranceProducts: z.array(productSchema).min(1),
        sendingIdentityId: z.string().min(1),
        applicantTypes: z.array(z.enum(["individual", "business"])).optional(),
        provinces: z.array(z.string().min(1)).optional(),
        cities: z.array(z.string().min(1)).optional(),
        industries: z.array(z.string().min(1)).optional(),
        minimumScore: z.number().int().min(0).max(100).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        assertWritesEnabled();
        const actor = getActor();
        assertCanCreate(actor);
        const organisationId = resolveOrganisation(actor, input.organisationId);
        const buyer = (await listRuntimeBuyers()).find((item) => item.id === organisationId);
        if (!buyer || buyer.status !== "active" || buyer.onboardingStatus !== "approved") {
          throw new Error("Campaign broker must be active and approved");
        }
        if (!buyer.acceptsCampaigns) throw new Error("Campaign permission is disabled for this broker");
        const invalidProducts = input.insuranceProducts.filter((product) => !buyer.insuranceProducts.includes(product));
        if (invalidProducts.length) throw new Error("Campaign includes products outside the broker's approved appetite");
        const identity = (await listRuntimeSendingIdentities(organisationId))
          .find((item) => item.id === input.sendingIdentityId);
        if (!identity) throw new Error("Sending identity belongs to another tenant or does not exist");
        const campaign = await createRuntimeCampaign({
          organisationId,
          name: input.name,
          objective: input.objective,
          insuranceProducts: input.insuranceProducts as InsuranceProduct[],
          audienceRules: {
            applicantTypes: input.applicantTypes,
            provinces: input.provinces,
            cities: input.cities,
            industries: input.industries,
            minimumScore: input.minimumScore,
          },
          contactBasis: "marketing_consent",
          sendingIdentityId: input.sendingIdentityId,
          createdBy: actor.label,
        });
        return campaignResult({ created: true, campaign: safeCampaign(campaign), generated: false, sent: false });
      } catch (error) {
        return campaignResult({ created: false, error: error instanceof Error ? error.message : "Unable to create campaign" });
      }
    },
  );

  server.registerTool(
    "generate_campaign_content",
    {
      title: "Generate campaign content",
      description: "Generate and store a new immutable content version. Generation can never approve or send.",
      inputSchema: {
        campaignId: z.string().min(1),
        keyMessage: z.string().min(10).max(1000),
        callToActionLabel: z.string().min(2).max(80),
        callToActionUrl: z.string().url().refine((value) => value.startsWith("https://"), "CTA URL must use HTTPS"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        assertWritesEnabled();
        const actor = getActor();
        assertCanCreate(actor);
        const campaign = await loadAccessibleCampaign(input.campaignId, actor);
        if (["sending", "completed", "cancelled"].includes(campaign.status)) {
          throw new Error("Campaign content can no longer be changed");
        }
        const buyer = (await listRuntimeBuyers()).find((item) => item.id === campaign.organisationId);
        if (!buyer) throw new Error("Campaign broker not found");
        const generated = generateCampaignCopy({
          campaign,
          brokerName: buyer.organisationName,
          keyMessage: input.keyMessage,
          callToActionLabel: input.callToActionLabel,
          callToActionUrl: input.callToActionUrl,
        });
        const content = await saveRuntimeCampaignContent(campaign.id, { ...generated, generatedBy: actor.label });
        return campaignResult({ generated: true, campaignId: campaign.id, contentVersion: content.version, requiresHumanApproval: true, sent: false });
      } catch (error) {
        return campaignResult({ generated: false, error: error instanceof Error ? error.message : "Unable to generate content" });
      }
    },
  );

  server.registerTool(
    "validate_campaign",
    {
      title: "Validate campaign",
      description: "Validate broker permissions, products, sender, content, consent, allocation scope, and suppressions.",
      inputSchema: { campaignId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ campaignId }) => {
      try {
        const actor = getActor();
        const campaign = await loadAccessibleCampaign(campaignId, actor);
        const evaluation = await getRuntimeCampaignEvaluation(campaign);
        const issues = validateCampaign({ campaign, ...evaluation });
        return campaignResult({
          valid: !issues.some((issue) => issue.severity === "error"),
          campaign: safeCampaign(campaign),
          audience: summariseAudience(evaluation.audience),
          issues,
        });
      } catch (error) {
        return campaignResult({ valid: false, error: error instanceof Error ? error.message : "Unable to validate campaign" });
      }
    },
  );

  server.registerTool(
    "preview_campaign",
    {
      title: "Preview campaign",
      description: "Render the current campaign content with synthetic placeholders and no recipient PII.",
      inputSchema: { campaignId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ campaignId }) => {
      try {
        const actor = getActor();
        const campaign = await loadAccessibleCampaign(campaignId, actor);
        const evaluation = await getRuntimeCampaignEvaluation(campaign);
        if (!evaluation.content) throw new Error("Generate campaign content before previewing it");
        const rendered = renderCampaignContent(evaluation.content, {
          firstName: "Sample recipient",
          unsubscribeUrl: "https://example.invalid/unsubscribe",
        });
        return campaignResult({ campaign: safeCampaign(campaign), contentVersion: evaluation.content.version, preview: rendered, recipientData: "synthetic" });
      } catch (error) {
        return campaignResult({ previewed: false, error: error instanceof Error ? error.message : "Unable to preview campaign" });
      }
    },
  );

  server.registerTool(
    "send_test_campaign",
    {
      title: "Send a test campaign",
      description: "Send the current content to one explicit test address. This does not launch the campaign audience.",
      inputSchema: {
        campaignId: z.string().min(1),
        testRecipient: z.string().email(),
        confirmation: z.literal("SEND TEST"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ campaignId, testRecipient }) => {
      try {
        assertWritesEnabled();
        const actor = getActor();
        assertCanCreate(actor);
        const campaign = await loadAccessibleCampaign(campaignId, actor);
        const evaluation = await getRuntimeCampaignEvaluation(campaign);
        if (!evaluation.content) throw new Error("Generate campaign content before sending a test");
        if (!evaluation.sendingIdentity || evaluation.sendingIdentity.status !== "verified") {
          throw new Error("A verified tenant sending identity is required");
        }
        const nonAudienceErrors = validateCampaign({ campaign, ...evaluation })
          .filter((issue) => issue.severity === "error" && issue.code !== "audience_empty");
        if (nonAudienceErrors.length) throw new Error(nonAudienceErrors[0].message);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://example.invalid";
        const rendered = renderCampaignContent(evaluation.content, {
          firstName: "Test recipient",
          unsubscribeUrl: new URL("/privacy", appUrl).toString(),
        });
        let providerMessageId = `demo_test_${Date.now()}`;
        if (getDataMode() !== "demo") {
          const mode = getCampaignDeliveryMode();
          if (mode !== "test" && mode !== "live") throw new Error("Campaign delivery mode does not allow test messages");
          providerMessageId = (await sendCampaignEmail({
            sendingIdentity: evaluation.sendingIdentity,
            to: testRecipient,
            subject: `[TEST] ${rendered.subject}`,
            html: rendered.htmlBody,
            text: rendered.textBody,
            unsubscribeUrl: new URL("/privacy", appUrl).toString(),
            idempotencyKey: `test-${campaign.id}-${evaluation.content.version}-${Date.now()}`,
            campaignId: campaign.id,
          })).providerMessageId;
        }
        await appendRuntimeCampaignEvent({
          campaignId: campaign.id,
          eventType: "test_sent",
          actor: actor.label,
          details: { contentVersion: evaluation.content.version, providerMessageId, simulated: getDataMode() === "demo" },
        });
        return campaignResult({ sent: true, testOnly: true, simulated: getDataMode() === "demo", providerMessageId });
      } catch (error) {
        return campaignResult({ sent: false, error: error instanceof Error ? error.message : "Unable to send test" });
      }
    },
  );

  server.registerTool(
    "approve_campaign",
    {
      title: "Approve a campaign",
      description: "Record explicit human approval for the current content version after all policy checks pass.",
      inputSchema: {
        campaignId: z.string().min(1),
        approvalStatement: z.literal("I approve this campaign for delivery"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ campaignId, approvalStatement }) => {
      try {
        assertWritesEnabled();
        const actor = getActor();
        assertCanApprove(actor);
        const campaign = await loadAccessibleCampaign(campaignId, actor);
        if (campaign.approvedContentVersion === campaign.currentContentVersion && campaign.approvedAt) {
          return campaignResult({
            approved: true,
            alreadyApproved: true,
            campaign: safeCampaign(campaign),
            launchRequired: ["approved", "paused"].includes(campaign.status),
            sent: ["sending", "completed"].includes(campaign.status),
          });
        }
        if (!["draft", "pending_review"].includes(campaign.status)) {
          throw new Error("Only a draft or pending-review campaign can be approved");
        }
        const evaluation = await getRuntimeCampaignEvaluation(campaign);
        const issues = validateCampaign({ campaign, ...evaluation });
        const errors = issues.filter((issue) => issue.severity === "error");
        if (errors.length) throw new Error(errors.map((issue) => issue.message).join(" "));
        if (!evaluation.content) throw new Error("Current content could not be loaded");
        const approved = await approveRuntimeCampaign({
          campaign,
          content: evaluation.content,
          actor: actor.label,
          attestation: approvalStatement,
        });
        return campaignResult({ approved: true, campaign: approved ? safeCampaign(approved) : null, launchRequired: true, sent: false });
      } catch (error) {
        return campaignResult({ approved: false, error: error instanceof Error ? error.message : "Unable to approve campaign" });
      }
    },
  );

  server.registerTool(
    "launch_campaign",
    {
      title: "Launch an approved campaign",
      description: "Send one bounded batch after a separate approval and an exact launch confirmation.",
      inputSchema: {
        campaignId: z.string().min(1),
        confirmation: z.string().min(1),
        batchSize: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ campaignId, confirmation, batchSize }) => {
      try {
        assertWritesEnabled();
        const actor = getActor();
        assertCanCreate(actor);
        const campaign = await loadAccessibleCampaign(campaignId, actor);
        if (confirmation !== `LAUNCH ${campaign.id}`) throw new Error(`Confirmation must equal LAUNCH ${campaign.id}`);
        if (!["approved", "sending", "paused"].includes(campaign.status)) throw new Error("Campaign is not approved for launch");
        if (!campaign.currentContentVersion || campaign.approvedContentVersion !== campaign.currentContentVersion) {
          throw new Error("The current content version does not have approval");
        }
        const evaluation = await getRuntimeCampaignEvaluation(campaign);
        const issues = validateCampaign({ campaign, ...evaluation });
        const errors = issues.filter((issue) => issue.severity === "error");
        if (errors.length) throw new Error(errors.map((issue) => issue.message).join(" "));
        if (!evaluation.content || !evaluation.sendingIdentity) throw new Error("Campaign content or sending identity is missing");
        if (getDataMode() !== "demo" && getCampaignDeliveryMode() !== "live") {
          throw new Error("INSURELEAD_CAMPAIGN_DELIVERY_MODE must be live to launch a campaign");
        }

        let recipients = await listRuntimeCampaignRecipients(campaign.id);
        if (recipients.length === 0) recipients = await prepareRuntimeCampaignRecipients(campaign);
        const configuredMaximum = Math.max(1, Math.min(100, Number(process.env.CAMPAIGN_MAX_BATCH_SIZE ?? 25)) || 25);
        const selected = recipients.filter((recipient) => recipient.status === "queued").slice(0, Math.min(batchSize, configuredMaximum));
        if (!selected.length) throw new Error("No queued, eligible recipients remain");

        const launchedAt = campaign.launchedAt ?? new Date().toISOString();
        await updateRuntimeCampaign(campaign.id, { status: "sending", launchedAt });
        await appendRuntimeCampaignEvent({
          campaignId: campaign.id,
          eventType: "launch_started",
          actor: actor.label,
          details: { contentVersion: evaluation.content.version, batchSize: selected.length },
        });

        let sent = 0;
        let failed = 0;
        let suppressed = 0;
        for (const recipient of selected) {
          const latestCampaign = await getRuntimeCampaign(campaign.id);
          if (!latestCampaign || latestCampaign.status !== "sending") break;
          const latestEvaluation = await getRuntimeCampaignEvaluation(latestCampaign);
          const latestBlockingIssue = validateCampaign({ campaign: latestCampaign, ...latestEvaluation })
            .find((issue) => issue.severity === "error" && issue.code !== "audience_empty");
          if (latestBlockingIssue) {
            await updateRuntimeCampaign(campaign.id, { status: "paused", pausedAt: new Date().toISOString() });
            await appendRuntimeCampaignEvent({
              campaignId: campaign.id,
              eventType: "paused",
              actor: actor.label,
              details: { reason: `Automatic safety pause: ${latestBlockingIssue.message}` },
            });
            break;
          }
          const stillEligible = latestEvaluation.audience.some((item) =>
            item.leadId === recipient.leadId && item.eligible
          );
          if (!stillEligible) {
            await updateRuntimeCampaignRecipient(recipient.id, { status: "suppressed", exclusionReason: "Eligibility changed before send" });
            suppressed += 1;
            continue;
          }
          const lead = await getRuntimeLead(recipient.leadId);
          if (!lead) {
            await updateRuntimeCampaignRecipient(recipient.id, { status: "failed", exclusionReason: "Lead no longer exists" });
            failed += 1;
            continue;
          }
          try {
            const unsubscribeUrl = createCampaignUnsubscribeUrl({
              campaignId: campaign.id,
              organisationId: campaign.organisationId,
              leadId: lead.id,
            });
            const rendered = renderCampaignContent(evaluation.content, {
              firstName: lead.contactFullName.split(/\s+/)[0] || "there",
              unsubscribeUrl,
            });
            const result = getDataMode() === "demo"
              ? { providerMessageId: `demo_${recipient.id}` }
              : await sendCampaignEmail({
                sendingIdentity: evaluation.sendingIdentity,
                to: lead.contactEmail,
                subject: rendered.subject,
                html: rendered.htmlBody,
                text: rendered.textBody,
                unsubscribeUrl,
                idempotencyKey: `campaign-${campaign.id}-${recipient.id}-${evaluation.content.version}`,
                campaignId: campaign.id,
              });
            await updateRuntimeCampaignRecipient(recipient.id, {
              status: "sent",
              providerMessageId: result.providerMessageId,
              sentAt: new Date().toISOString(),
            });
            await appendRuntimeCampaignEvent({
              campaignId: campaign.id,
              eventType: "recipient_sent",
              actor: actor.label,
              recipientId: recipient.id,
              details: { providerMessageId: result.providerMessageId },
            });
            sent += 1;
          } catch (error) {
            await updateRuntimeCampaignRecipient(recipient.id, { status: "failed", exclusionReason: "Provider delivery failed" });
            await appendRuntimeCampaignEvent({
              campaignId: campaign.id,
              eventType: "recipient_failed",
              actor: actor.label,
              recipientId: recipient.id,
              details: { error: error instanceof Error ? error.message : "Provider delivery failed" },
            });
            failed += 1;
          }
        }

        const latestRecipients = await listRuntimeCampaignRecipients(campaign.id);
        const remaining = latestRecipients.filter((recipient) => recipient.status === "queued").length;
        if (remaining === 0) {
          await updateRuntimeCampaign(campaign.id, { status: sent > 0 ? "completed" : "failed" });
          await appendRuntimeCampaignEvent({
            campaignId: campaign.id,
            eventType: "completed",
            actor: actor.label,
            details: { sent, failed, suppressed },
          });
        }
        return campaignResult({ launched: true, simulated: getDataMode() === "demo", sent, failed, suppressed, remaining });
      } catch (error) {
        return campaignResult({ launched: false, error: error instanceof Error ? error.message : "Unable to launch campaign" });
      }
    },
  );

  server.registerTool(
    "pause_campaign",
    {
      title: "Pause campaign",
      description: "Pause an approved, scheduled, or sending campaign before another batch starts.",
      inputSchema: { campaignId: z.string().min(1), reason: z.string().min(3).max(500) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ campaignId, reason }) => {
      try {
        assertWritesEnabled();
        const actor = getActor();
        assertCanCreate(actor);
        const campaign = await loadAccessibleCampaign(campaignId, actor);
        if (!["approved", "scheduled", "sending", "paused"].includes(campaign.status)) {
          throw new Error("Only an approved, scheduled, sending, or paused campaign can be paused");
        }
        if (campaign.status !== "paused") {
          await updateRuntimeCampaign(campaign.id, { status: "paused", pausedAt: new Date().toISOString() });
          await appendRuntimeCampaignEvent({ campaignId: campaign.id, eventType: "paused", actor: actor.label, details: { reason } });
        }
        return campaignResult({ paused: true, campaignId: campaign.id });
      } catch (error) {
        return campaignResult({ paused: false, error: error instanceof Error ? error.message : "Unable to pause campaign" });
      }
    },
  );

  server.registerTool(
    "get_campaign_performance",
    {
      title: "Get campaign performance",
      description: "Return tenant-scoped aggregate delivery outcomes without exposing recipient PII.",
      inputSchema: { campaignId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ campaignId }) => {
      try {
        const actor = getActor();
        const campaign = await loadAccessibleCampaign(campaignId, actor);
        return campaignResult({ campaign: safeCampaign(campaign), performance: await getRuntimeCampaignPerformance(campaign.id) });
      } catch (error) {
        return campaignResult({ found: false, error: error instanceof Error ? error.message : "Unable to load campaign performance" });
      }
    },
  );
}
