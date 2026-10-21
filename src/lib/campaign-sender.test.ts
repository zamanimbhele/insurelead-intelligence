import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignEvent, CampaignRecipient } from "./types";

// In-memory stand-in for the runtime data layer, so the batch rules can be
// exercised without a database, a provider, or demo JSON files.
const state = vi.hoisted(() => ({
  mode: "demo" as "demo" | "supabase",
  deliveryMode: "live",
  campaigns: new Map<string, Campaign>(),
  recipients: [] as CampaignRecipient[],
  events: [] as CampaignEvent[],
  usage: { sentToday: 0, sentThisMonth: 0 },
  limits: { dailyLimit: 200, monthlyLimit: 3000 },
  leaseHeld: false,
  campaignErrors: [] as string[],
  ineligibleLeads: new Map<string, string>(),
  onSend: undefined as undefined | ((leadId: string) => void),
  sentTo: [] as string[],
}));

vi.mock("./supabase/config.ts", () => ({ getDataMode: () => state.mode }));
vi.mock("./campaign-delivery.ts", () => ({
  getCampaignDeliveryMode: () => state.deliveryMode,
  sendCampaignEmail: vi.fn(async (input: { to: string }) => {
    state.sentTo.push(input.to);
    return { providerMessageId: `msg_${state.sentTo.length}` };
  }),
}));
vi.mock("./campaign-unsubscribe.ts", () => ({ createCampaignUnsubscribeUrl: () => "https://example.test/u" }));
vi.mock("./campaign-runtime.ts", async () => {
  const { quotaStatus } = await import("./campaign-quota");
  const content = {
    id: "content_1", campaignId: "c1", version: 1, subject: "Review your cover", preheader: "",
    htmlBody: "<p>Hi {{first_name}} {{unsubscribe_url}}</p>", textBody: "Hi {{first_name}} {{unsubscribe_url}}",
    generatedBy: "test", createdAt: "2026-10-01T00:00:00Z",
  };
  const identity = { id: "identity_1", organisationId: "org_1", status: "verified", fromName: "Broker", fromEmail: "a@b.test" };
  const buyer = {
    id: "org_1", status: "active", onboardingStatus: "approved", acceptsCampaigns: true,
    insuranceProducts: ["motor_insurance"],
  };
  const lead = (leadId: string) => ({ id: leadId, contactFullName: `Lead ${leadId}`, contactEmail: `${leadId}@example.test` });
  return {
    getRuntimeCampaign: async (id: string) => state.campaigns.get(id),
    updateRuntimeCampaign: async (id: string, changes: Partial<Campaign>) => {
      const next = { ...state.campaigns.get(id)!, ...changes };
      state.campaigns.set(id, next);
      return next;
    },
    getRuntimeCampaignEvaluation: async () => ({
      buyer, sendingIdentity: identity, content,
      audience: [{ leadId: "x", eligible: true, reasons: [] }], leads: [],
    }),
    claimRuntimeCampaignSendLease: async () => {
      if (state.leaseHeld) return false;
      state.leaseHeld = true;
      return true;
    },
    releaseRuntimeCampaignSendLease: async () => { state.leaseHeld = false; },
    listRuntimeCampaignRecipients: async (id: string) => state.recipients.filter((r) => r.campaignId === id),
    prepareRuntimeCampaignRecipients: async (campaign: Campaign) => state.recipients.filter((r) => r.campaignId === campaign.id),
    updateRuntimeCampaignRecipient: async (id: string, changes: Partial<CampaignRecipient>) => {
      const index = state.recipients.findIndex((r) => r.id === id);
      state.recipients[index] = { ...state.recipients[index], ...changes };
      if (changes.sentAt) {
        state.usage.sentToday += 1;
        state.usage.sentThisMonth += 1;
      }
      return state.recipients[index];
    },
    appendRuntimeCampaignEvent: async (event: Omit<CampaignEvent, "id" | "occurredAt">) => {
      state.events.push({ ...event, id: `e${state.events.length}`, occurredAt: new Date().toISOString() } as CampaignEvent);
    },
    listRuntimeCampaignEvents: async (id: string) => state.events.filter((e) => e.campaignId === id),
    getRuntimeCampaignQuota: async () => quotaStatus(state.limits, state.usage),
    getRuntimeRecipientSendCheck: async (_campaign: Campaign, leadId: string) => {
      state.onSend?.(leadId);
      const reason = state.ineligibleLeads.get(leadId);
      return {
        lead: lead(leadId),
        content,
        sendingIdentity: identity,
        blockingIssue: state.campaignErrors.length ? { code: "x", severity: "error", message: state.campaignErrors[0] } : undefined,
        eligible: !reason,
        reasons: reason ? [reason] : [],
      };
    },
  };
});
vi.mock("./campaign-policy.ts", async (original) => ({
  ...(await original<typeof import("./campaign-policy")>()),
  validateCampaign: () => state.campaignErrors.map((message) => ({ code: "x", severity: "error", message })),
}));

const { CampaignSendError, runCampaignScheduler, sendCampaignBatch } = await import("./campaign-sender");

function seed(status: Campaign["status"], queued: number, extra: Partial<Campaign> = {}) {
  const campaign: Campaign = {
    id: "c1", organisationId: "org_1", name: "Spring motor review", objective: "renewal_reminder",
    insuranceProducts: ["motor_insurance"], audienceRules: {}, contactBasis: "marketing_consent",
    sendingIdentityId: "identity_1", status, currentContentVersion: 1, approvedContentVersion: 1,
    createdBy: "test", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...extra,
  };
  state.campaigns.set(campaign.id, campaign);
  state.recipients = Array.from({ length: queued }, (_, index) => ({
    id: `r${index + 1}`, campaignId: "c1", leadId: `lead${index + 1}`, status: "queued", createdAt: "2026-10-01T00:00:00Z",
  } as CampaignRecipient));
  return campaign;
}

beforeEach(() => {
  Object.assign(state, {
    mode: "demo", deliveryMode: "live", recipients: [], events: [], usage: { sentToday: 0, sentThisMonth: 0 },
    limits: { dailyLimit: 200, monthlyLimit: 3000 }, leaseHeld: false, campaignErrors: [],
    ineligibleLeads: new Map(), onSend: undefined, sentTo: [],
  });
  state.campaigns.clear();
});

describe("sendCampaignBatch", () => {
  it("sends no more than the tenant's remaining daily quota", async () => {
    state.usage = { sentToday: 197, sentThisMonth: 500 };
    const result = await sendCampaignBatch({ campaign: seed("approved", 10), actor: "test", trigger: "mcp", requestedBatchSize: 25 });
    expect(result.sent).toBe(3);
    expect(result.remaining).toBe(7);
    expect(result.quota.remainingToday).toBe(0);
    expect(state.campaigns.get("c1")?.status).toBe("sending");
  });

  it("defers with a quota error once the limit is spent, and logs it once per day", async () => {
    state.usage = { sentToday: 200, sentThisMonth: 200 };
    const campaign = seed("sending", 5);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const error = await sendCampaignBatch({ campaign, actor: "test", trigger: "scheduler", requestedBatchSize: 25 })
        .catch((caught) => caught);
      expect(error).toBeInstanceOf(CampaignSendError);
      expect(error.kind).toBe("quota");
      expect(error.message).toMatch(/daily campaign send limit is reached/);
    }
    expect(state.events.filter((event) => event.eventType === "quota_deferred")).toHaveLength(1);
    expect(state.recipients.every((recipient) => recipient.status === "queued")).toBe(true);
    expect(state.leaseHeld).toBe(false);
  });

  it("refuses to run while another run holds the send lease", async () => {
    state.leaseHeld = true;
    const error = await sendCampaignBatch({ campaign: seed("sending", 3), actor: "test", trigger: "scheduler", requestedBatchSize: 25 })
      .catch((caught) => caught);
    expect(error.kind).toBe("busy");
    expect(state.sentTo).toHaveLength(0);
  });

  it("suppresses a recipient who became ineligible, recording the specific reason", async () => {
    state.mode = "supabase";
    state.ineligibleLeads.set("lead2", "Lead is marked do not contact");
    const result = await sendCampaignBatch({ campaign: seed("approved", 3), actor: "test", trigger: "mcp", requestedBatchSize: 25 });
    expect(result.sent).toBe(2);
    expect(result.suppressed).toBe(1);
    expect(state.recipients.find((recipient) => recipient.leadId === "lead2")?.exclusionReason)
      .toBe("Eligibility changed before send: Lead is marked do not contact");
    expect(state.sentTo).toEqual(["lead1@example.test", "lead3@example.test"]);
  });

  it("pauses mid-batch when the content is changed after approval", async () => {
    state.mode = "supabase"; // exercise the real provider call path
    state.onSend = (leadId) => {
      if (leadId === "lead2") state.campaigns.set("c1", { ...state.campaigns.get("c1")!, currentContentVersion: 2 });
    };
    const result = await sendCampaignBatch({ campaign: seed("approved", 4), actor: "test", trigger: "mcp", requestedBatchSize: 25 });
    // The edit lands while lead2 is being checked: lead2 still receives the
    // previously approved version 1 (never the unapproved draft), and the
    // very next recipient sees the reset approval and pauses the campaign.
    expect(result.sent).toBe(2);
    expect(state.sentTo).toEqual(["lead1@example.test", "lead2@example.test"]);
    expect(result.paused).toBe(true);
    expect(state.campaigns.get("c1")?.status).toBe("paused");
    expect(state.events.at(-1)?.details.reason).toMatch(/content changed after approval/);
  });

  it("marks the campaign completed when the last batch sends nothing new but earlier batches did", async () => {
    const campaign = seed("sending", 2);
    state.recipients[0] = { ...state.recipients[0], status: "sent", sentAt: "2026-10-20T08:00:00Z" };
    state.ineligibleLeads.set("lead2", "Recipient is suppressed");
    const result = await sendCampaignBatch({ campaign, actor: "test", trigger: "scheduler", requestedBatchSize: 25 });
    expect(result.sent).toBe(0);
    expect(result.completed).toBe(true);
    expect(state.campaigns.get("c1")?.status).toBe("completed");
  });

  it("will not let the MCP tool launch a scheduled campaign early", async () => {
    const error = await sendCampaignBatch({
      campaign: seed("scheduled", 2, { scheduledAt: "2026-12-01T06:00:00Z" }),
      actor: "test", trigger: "mcp", requestedBatchSize: 25,
    }).catch((caught) => caught);
    expect(error.message).toMatch(/cancel the schedule/);
  });

  it("requires live delivery mode in Supabase mode", async () => {
    state.mode = "supabase";
    state.deliveryMode = "test";
    const error = await sendCampaignBatch({ campaign: seed("sending", 2), actor: "test", trigger: "scheduler", requestedBatchSize: 25 })
      .catch((caught) => caught);
    expect(error.kind).toBe("config");
  });
});

describe("runCampaignScheduler", () => {
  const listDue = async () => [...state.campaigns.values()];

  it("starts a due scheduled campaign", async () => {
    seed("scheduled", 2, { scheduledAt: "2026-10-21T06:00:00Z" });
    const outcomes = await runCampaignScheduler({ listDue, now: new Date("2026-10-21T06:05:00Z") });
    expect(outcomes).toEqual([{ campaignId: "c1", outcome: "completed", sent: 2, remaining: 0 }]);
  });

  it("does not send a scheduled campaign before its time", async () => {
    seed("scheduled", 2, { scheduledAt: "2026-10-22T06:00:00Z" });
    const outcomes = await runCampaignScheduler({ listDue, now: new Date("2026-10-21T06:05:00Z") });
    expect(outcomes[0].outcome).toBe("skipped");
    expect(state.sentTo).toHaveLength(0);
  });

  it("pauses a campaign that can no longer pass validation instead of retrying it forever", async () => {
    seed("sending", 2);
    state.campaignErrors = ["The selected sending identity is not verified."];
    const outcomes = await runCampaignScheduler({ listDue });
    expect(outcomes[0].outcome).toBe("paused");
    expect(state.campaigns.get("c1")?.status).toBe("paused");
  });

  it("leaves the campaign untouched when the deployment is not configured to send", async () => {
    state.mode = "supabase";
    state.deliveryMode = "disabled";
    seed("sending", 2);
    const outcomes = await runCampaignScheduler({ listDue });
    expect(outcomes[0].outcome).toBe("skipped");
    expect(state.campaigns.get("c1")?.status).toBe("sending");
  });
});
