// One bounded send batch for one campaign - shared by the MCP
// launch_campaign tool and the scheduled sender (/api/cron/campaign-sends).
//
// Order of checks, each of which can stop the batch:
//   1. campaign state: approved content == current content, status allows
//      sending for this trigger, campaign-level validation passes
//   2. delivery mode is live (Supabase mode only)
//   3. an exclusive send lease (no two runs process one queue at once)
//   4. tenant quota: daily and monthly limits across all campaigns
//   5. per recipient, at send time: campaign still sending, approval not
//      reset, campaign-level validation, and that lead's own eligibility
//      (consent, Do Not Contact, suppression, allocation, segment)
import { getCampaignDeliveryMode, sendCampaignEmail } from "./campaign-delivery.ts";
import { renderCampaignContent, validateCampaign } from "./campaign-policy.ts";
import {
  batchAllowance,
  configuredMaximumBatchSize,
  sastDateKey,
  type CampaignQuotaStatus,
} from "./campaign-quota.ts";
import {
  appendRuntimeCampaignEvent,
  claimRuntimeCampaignSendLease,
  getRuntimeCampaign,
  getRuntimeCampaignEvaluation,
  getRuntimeCampaignQuota,
  getRuntimeRecipientSendCheck,
  listRuntimeCampaignEvents,
  listRuntimeCampaignRecipients,
  prepareRuntimeCampaignRecipients,
  releaseRuntimeCampaignSendLease,
  updateRuntimeCampaign,
  updateRuntimeCampaignRecipient,
} from "./campaign-runtime.ts";
import { createCampaignUnsubscribeUrl } from "./campaign-unsubscribe.ts";
import { getDataMode } from "./supabase/config.ts";
import type { Campaign, CampaignStatus } from "./types.ts";

export type CampaignSendTrigger = "mcp" | "scheduler";

// "blocked": the campaign itself cannot send until a person fixes it
//   (the scheduler pauses it so it stops retrying every run).
// "config": the deployment is not configured to send (left untouched).
// "busy": another run holds the send lease (try again next run).
// "quota": the tenant's daily or monthly limit is spent (try again later).
// "empty": nothing queued and nothing left to prepare.
export type CampaignSendErrorKind = "blocked" | "config" | "busy" | "quota" | "empty";

export class CampaignSendError extends Error {
  constructor(message: string, readonly kind: CampaignSendErrorKind, readonly quota?: CampaignQuotaStatus) {
    super(message);
    this.name = "CampaignSendError";
  }
}

export type CampaignBatchResult = {
  campaignId: string;
  simulated: boolean;
  sent: number;
  failed: number;
  suppressed: number;
  remaining: number;
  paused: boolean;
  completed: boolean;
  quota: CampaignQuotaStatus;
};

const SENDABLE_STATUSES: Record<CampaignSendTrigger, CampaignStatus[]> = {
  // The MCP tool can start an approved campaign or resume a paused one.
  mcp: ["approved", "sending", "paused"],
  // The scheduler only ever continues what a person scheduled or started.
  scheduler: ["scheduled", "sending"],
};

// Long enough for a 100-recipient batch; expires on its own if a run dies.
export const SEND_LEASE_SECONDS = 300;

export async function sendCampaignBatch(input: {
  campaign: Campaign;
  actor: string;
  trigger: CampaignSendTrigger;
  requestedBatchSize: number;
  now?: Date;
  // Stop starting new sends after this instant (scheduler time budget).
  deadline?: number;
}): Promise<CampaignBatchResult> {
  const { campaign, actor, trigger } = input;
  const now = input.now ?? new Date();

  if (trigger === "mcp" && campaign.status === "scheduled") {
    throw new CampaignSendError(
      "Campaign is scheduled; cancel the schedule on the dashboard to launch it now",
      "blocked",
    );
  }
  if (!SENDABLE_STATUSES[trigger].includes(campaign.status)) {
    throw new CampaignSendError("Campaign is not approved for launch", "blocked");
  }
  if (trigger === "scheduler" && campaign.status === "scheduled"
    && (!campaign.scheduledAt || new Date(campaign.scheduledAt) > now)) {
    throw new CampaignSendError("Campaign is not due yet", "empty");
  }
  if (!campaign.currentContentVersion || campaign.approvedContentVersion !== campaign.currentContentVersion) {
    throw new CampaignSendError("The current content version does not have approval", "blocked");
  }
  const evaluation = await getRuntimeCampaignEvaluation(campaign);
  const errors = validateCampaign({ campaign, ...evaluation }).filter((issue) => issue.severity === "error");
  if (errors.length) throw new CampaignSendError(errors.map((issue) => issue.message).join(" "), "blocked");
  if (!evaluation.content || !evaluation.sendingIdentity) {
    throw new CampaignSendError("Campaign content or sending identity is missing", "blocked");
  }
  const simulated = getDataMode() === "demo";
  if (!simulated && getCampaignDeliveryMode() !== "live") {
    throw new CampaignSendError("INSURELEAD_CAMPAIGN_DELIVERY_MODE must be live to launch a campaign", "config");
  }

  if (!(await claimRuntimeCampaignSendLease(campaign.id, SEND_LEASE_SECONDS))) {
    throw new CampaignSendError("Another send is already in progress for this campaign", "busy");
  }

  try {
    let recipients = await listRuntimeCampaignRecipients(campaign.id);
    if (recipients.length === 0) recipients = await prepareRuntimeCampaignRecipients(campaign);
    const queued = recipients.filter((recipient) => recipient.status === "queued");
    if (!queued.length) throw new CampaignSendError("No queued, eligible recipients remain", "empty");

    const quota = await getRuntimeCampaignQuota(campaign.organisationId, now);
    const allowance = batchAllowance({
      requested: input.requestedBatchSize,
      configuredMaximum: configuredMaximumBatchSize(process.env.CAMPAIGN_MAX_BATCH_SIZE),
      quotaRemaining: quota.remaining,
    });
    if (allowance === 0) {
      await recordQuotaDeferral(campaign, actor, quota, now);
      throw new CampaignSendError(
        `The broker's ${quota.exhaustedBy ?? "daily"} campaign send limit is reached `
          + `(${quota.sentToday}/${quota.dailyLimit} today, ${quota.sentThisMonth}/${quota.monthlyLimit} this month). `
          + "Queued recipients will be sent when the limit resets.",
        "quota",
        quota,
      );
    }
    const selected = queued.slice(0, allowance);

    const launchedAt = campaign.launchedAt ?? now.toISOString();
    await updateRuntimeCampaign(campaign.id, { status: "sending", launchedAt });
    await appendRuntimeCampaignEvent({
      campaignId: campaign.id,
      eventType: "launch_started",
      actor,
      details: {
        contentVersion: evaluation.content.version,
        batchSize: selected.length,
        trigger,
        quotaRemainingBefore: quota.remaining,
      },
    });

    let sent = 0;
    let failed = 0;
    let suppressed = 0;
    let paused = false;
    for (const recipient of selected) {
      if (input.deadline !== undefined && Date.now() > input.deadline) break;

      const latestCampaign = await getRuntimeCampaign(campaign.id);
      if (!latestCampaign || latestCampaign.status !== "sending") break;

      const check = await getRuntimeRecipientSendCheck(latestCampaign, recipient.leadId);
      const approvalReset = latestCampaign.approvedContentVersion !== latestCampaign.currentContentVersion;
      const blockingReason = approvalReset
        ? "The content changed after approval."
        : check.blockingIssue?.message;
      if (blockingReason) {
        await pauseCampaign(campaign.id, actor, `Automatic safety pause: ${blockingReason}`);
        paused = true;
        break;
      }
      if (!check.lead) {
        await updateRuntimeCampaignRecipient(recipient.id, { status: "failed", exclusionReason: "Lead no longer exists" });
        failed += 1;
        continue;
      }
      if (!check.eligible) {
        await updateRuntimeCampaignRecipient(recipient.id, {
          status: "suppressed",
          exclusionReason: `Eligibility changed before send: ${check.reasons[0] ?? "no longer eligible"}`,
        });
        suppressed += 1;
        continue;
      }

      const lead = check.lead;
      try {
        const unsubscribeUrl = createCampaignUnsubscribeUrl({
          campaignId: campaign.id,
          organisationId: campaign.organisationId,
          leadId: lead.id,
        });
        // Always the batch's approved content, never a newer draft.
        const rendered = renderCampaignContent(evaluation.content, {
          firstName: lead.contactFullName.split(/\s+/)[0] || "there",
          unsubscribeUrl,
        });
        const result = simulated
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
          actor,
          recipientId: recipient.id,
          details: { providerMessageId: result.providerMessageId },
        });
        sent += 1;
      } catch (error) {
        await updateRuntimeCampaignRecipient(recipient.id, { status: "failed", exclusionReason: "Provider delivery failed" });
        await appendRuntimeCampaignEvent({
          campaignId: campaign.id,
          eventType: "recipient_failed",
          actor,
          recipientId: recipient.id,
          details: { error: error instanceof Error ? error.message : "Provider delivery failed" },
        });
        failed += 1;
      }
    }

    const remaining = (await listRuntimeCampaignRecipients(campaign.id))
      .filter((recipient) => recipient.status === "queued").length;
    let completed = false;
    if (remaining === 0 && !paused) {
      const everSent = (await listRuntimeCampaignRecipients(campaign.id))
        .some((recipient) => recipient.sentAt);
      await updateRuntimeCampaign(campaign.id, { status: everSent ? "completed" : "failed" });
      await appendRuntimeCampaignEvent({
        campaignId: campaign.id,
        eventType: "completed",
        actor,
        details: { sent, failed, suppressed },
      });
      completed = true;
    }
    return {
      campaignId: campaign.id,
      simulated,
      sent,
      failed,
      suppressed,
      remaining,
      paused,
      completed,
      quota: { ...quota, sentToday: quota.sentToday + sent, sentThisMonth: quota.sentThisMonth + sent,
        remainingToday: Math.max(0, quota.remainingToday - sent),
        remainingThisMonth: Math.max(0, quota.remainingThisMonth - sent),
        remaining: Math.max(0, quota.remaining - sent) },
    };
  } finally {
    await releaseRuntimeCampaignSendLease(campaign.id);
  }
}

export async function pauseCampaign(campaignId: string, actor: string, reason: string) {
  await updateRuntimeCampaign(campaignId, { status: "paused", pausedAt: new Date().toISOString() });
  await appendRuntimeCampaignEvent({ campaignId, eventType: "paused", actor, details: { reason } });
}

// A scheduler running every few minutes would otherwise log the same
// deferral dozens of times a day; one entry per campaign per SAST day.
async function recordQuotaDeferral(campaign: Campaign, actor: string, quota: CampaignQuotaStatus, now: Date) {
  const today = sastDateKey(now);
  const events = await listRuntimeCampaignEvents(campaign.id);
  if (events.some((event) => event.eventType === "quota_deferred" && sastDateKey(new Date(event.occurredAt)) === today)) {
    return;
  }
  await appendRuntimeCampaignEvent({
    campaignId: campaign.id,
    eventType: "quota_deferred",
    actor,
    details: {
      exhaustedBy: quota.exhaustedBy,
      sentToday: quota.sentToday,
      dailyLimit: quota.dailyLimit,
      sentThisMonth: quota.sentThisMonth,
      monthlyLimit: quota.monthlyLimit,
    },
  });
}

export type SchedulerCampaignOutcome = {
  campaignId: string;
  outcome: "sent" | "completed" | "paused" | "quota_deferred" | "busy" | "skipped" | "error";
  detail?: string;
  sent?: number;
  remaining?: number;
};

// One scheduler pass: every due campaign gets at most one batch. A
// campaign that can no longer send (approval reset, sender unverified,
// broker suspended...) is paused with the reason, so it stops being
// retried and shows up on the dashboard for a person to fix.
export async function runCampaignScheduler(input: {
  listDue: (now: Date, limit: number) => Promise<Campaign[]>;
  now?: Date;
  maxCampaigns?: number;
  deadline?: number;
  batchSize?: number;
}): Promise<SchedulerCampaignOutcome[]> {
  const now = input.now ?? new Date();
  const due = await input.listDue(now, input.maxCampaigns ?? 10);
  const outcomes: SchedulerCampaignOutcome[] = [];
  for (const campaign of due) {
    if (input.deadline !== undefined && Date.now() > input.deadline) {
      outcomes.push({ campaignId: campaign.id, outcome: "skipped", detail: "Time budget reached; next run" });
      continue;
    }
    try {
      const result = await sendCampaignBatch({
        campaign,
        actor: "Scheduled sender",
        trigger: "scheduler",
        requestedBatchSize: input.batchSize ?? 100,
        now,
        deadline: input.deadline,
      });
      outcomes.push({
        campaignId: campaign.id,
        outcome: result.paused ? "paused" : result.completed ? "completed" : "sent",
        sent: result.sent,
        remaining: result.remaining,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send campaign batch";
      if (error instanceof CampaignSendError) {
        if (error.kind === "blocked") {
          await pauseCampaign(campaign.id, "Scheduled sender", `Automatic safety pause: ${message}`);
          outcomes.push({ campaignId: campaign.id, outcome: "paused", detail: message });
        } else if (error.kind === "quota") {
          outcomes.push({ campaignId: campaign.id, outcome: "quota_deferred", detail: message });
        } else if (error.kind === "busy") {
          outcomes.push({ campaignId: campaign.id, outcome: "busy", detail: message });
        } else {
          outcomes.push({ campaignId: campaign.id, outcome: "skipped", detail: message });
        }
      } else {
        // Unexpected (database/network): leave the campaign as it is so the
        // next run retries, and report it.
        outcomes.push({ campaignId: campaign.id, outcome: "error", detail: message });
      }
    }
  }
  return outcomes;
}
