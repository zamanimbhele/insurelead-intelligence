import fs from "node:fs";
import path from "node:path";

import type {
  Campaign,
  CampaignContentVersion,
  CampaignEvent,
  CampaignRecipient,
  MarketingSuppression,
} from "./types.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const CAMPAIGNS_FILE = path.join(DATA_DIR, "campaigns.json");
const CONTENT_FILE = path.join(DATA_DIR, "campaign-content-versions.json");
const RECIPIENTS_FILE = path.join(DATA_DIR, "campaign-recipients.json");
const EVENTS_FILE = path.join(DATA_DIR, "campaign-events.json");
const SUPPRESSIONS_FILE = path.join(DATA_DIR, "marketing-suppressions.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function demoId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCampaigns(organisationId?: string): Campaign[] {
  const campaigns = readJson<Campaign[]>(CAMPAIGNS_FILE, []);
  return organisationId
    ? campaigns.filter((campaign) => campaign.organisationId === organisationId)
    : campaigns;
}

export function getCampaignById(campaignId: string) {
  return getCampaigns().find((campaign) => campaign.id === campaignId);
}

export function createCampaign(input: Omit<Campaign, "id" | "status" | "createdAt" | "updatedAt">): Campaign {
  const campaigns = getCampaigns();
  const now = new Date().toISOString();
  const campaign: Campaign = {
    ...input,
    id: demoId("campaign"),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  campaigns.unshift(campaign);
  writeJson(CAMPAIGNS_FILE, campaigns);
  return campaign;
}

export function updateCampaign(
  campaignId: string,
  changes: Partial<Omit<Campaign, "id" | "organisationId" | "createdAt">>,
) {
  const campaigns = getCampaigns();
  const index = campaigns.findIndex((campaign) => campaign.id === campaignId);
  if (index === -1) return undefined;
  campaigns[index] = {
    ...campaigns[index],
    ...changes,
    id: campaigns[index].id,
    organisationId: campaigns[index].organisationId,
    createdAt: campaigns[index].createdAt,
    updatedAt: new Date().toISOString(),
  };
  writeJson(CAMPAIGNS_FILE, campaigns);
  return campaigns[index];
}

export function getCampaignContentVersions(campaignId: string): CampaignContentVersion[] {
  return readJson<CampaignContentVersion[]>(CONTENT_FILE, [])
    .filter((content) => content.campaignId === campaignId)
    .sort((a, b) => b.version - a.version);
}

export function getCurrentCampaignContent(campaignId: string) {
  return getCampaignContentVersions(campaignId)[0];
}

export function appendCampaignContent(
  campaignId: string,
  input: Omit<CampaignContentVersion, "id" | "campaignId" | "version" | "createdAt">,
) {
  const allContent = readJson<CampaignContentVersion[]>(CONTENT_FILE, []);
  const version = Math.max(
    0,
    ...allContent.filter((item) => item.campaignId === campaignId).map((item) => item.version),
  ) + 1;
  const content: CampaignContentVersion = {
    ...input,
    id: demoId("content"),
    campaignId,
    version,
    createdAt: new Date().toISOString(),
  };
  allContent.unshift(content);
  writeJson(CONTENT_FILE, allContent);
  updateCampaign(campaignId, {
    currentContentVersion: version,
    approvedContentVersion: undefined,
    approvedBy: undefined,
    approvedAt: undefined,
    status: "draft",
  });
  return content;
}

export function getCampaignRecipients(campaignId: string): CampaignRecipient[] {
  return readJson<CampaignRecipient[]>(RECIPIENTS_FILE, [])
    .filter((recipient) => recipient.campaignId === campaignId);
}

// providerMessageId is set once, at send time (see updateCampaignRecipient's
// "sent" transition), and is unique per send - inbound provider webhooks
// (campaign-webhooks.ts) key off it rather than campaign/recipient ids,
// since a webhook payload carries only the provider's own message id.
export function getCampaignRecipientByProviderMessageId(providerMessageId: string): CampaignRecipient | undefined {
  return readJson<CampaignRecipient[]>(RECIPIENTS_FILE, [])
    .find((recipient) => recipient.providerMessageId === providerMessageId);
}

export function replaceCampaignRecipients(campaignId: string, leadIds: string[]) {
  const others = readJson<CampaignRecipient[]>(RECIPIENTS_FILE, [])
    .filter((recipient) => recipient.campaignId !== campaignId);
  const createdAt = new Date().toISOString();
  const recipients = leadIds.map<CampaignRecipient>((leadId) => ({
    id: demoId("recipient"),
    campaignId,
    leadId,
    status: "queued",
    createdAt,
  }));
  writeJson(RECIPIENTS_FILE, [...recipients, ...others]);
  return recipients;
}

export function updateCampaignRecipient(
  recipientId: string,
  changes: Partial<Pick<CampaignRecipient, "status" | "providerMessageId" | "sentAt" | "exclusionReason">>,
) {
  const recipients = readJson<CampaignRecipient[]>(RECIPIENTS_FILE, []);
  const index = recipients.findIndex((recipient) => recipient.id === recipientId);
  if (index === -1) return undefined;
  recipients[index] = { ...recipients[index], ...changes };
  writeJson(RECIPIENTS_FILE, recipients);
  return recipients[index];
}

export function getCampaignEvents(campaignId: string): CampaignEvent[] {
  return readJson<CampaignEvent[]>(EVENTS_FILE, [])
    .filter((event) => event.campaignId === campaignId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function appendCampaignEvent(
  input: Omit<CampaignEvent, "id" | "occurredAt">,
): CampaignEvent {
  const events = readJson<CampaignEvent[]>(EVENTS_FILE, []);
  const event: CampaignEvent = {
    ...input,
    id: demoId("event"),
    occurredAt: new Date().toISOString(),
  };
  events.unshift(event);
  writeJson(EVENTS_FILE, events);
  return event;
}

export function getMarketingSuppressions(organisationId?: string): MarketingSuppression[] {
  const suppressions = readJson<MarketingSuppression[]>(SUPPRESSIONS_FILE, []);
  return organisationId
    ? suppressions.filter((suppression) => suppression.organisationId === organisationId)
    : suppressions;
}

export function saveMarketingSuppression(
  input: Omit<MarketingSuppression, "id" | "createdAt">,
) {
  const suppressions = getMarketingSuppressions();
  const existing = suppressions.find((item) =>
    item.organisationId === input.organisationId && item.emailHash === input.emailHash
  );
  if (existing) return existing;
  const suppression: MarketingSuppression = {
    ...input,
    id: demoId("suppression"),
    createdAt: new Date().toISOString(),
  };
  suppressions.unshift(suppression);
  writeJson(SUPPRESSIONS_FILE, suppressions);
  return suppression;
}

// --- Scheduled sending and quotas (demo mode) --------------------------

// Every recipient handed to the provider since the given instants, across
// all of the tenant's campaigns - the demo counterpart of
// campaign_send_usage() (migration 202610210002).
export function getCampaignSendUsage(organisationId: string, sinceDay: Date, sinceMonth: Date) {
  const campaignIds = new Set(getCampaigns(organisationId).map((campaign) => campaign.id));
  const sent = readJson<CampaignRecipient[]>(RECIPIENTS_FILE, [])
    .filter((recipient) => campaignIds.has(recipient.campaignId) && recipient.sentAt)
    .map((recipient) => new Date(recipient.sentAt as string).getTime());
  return {
    sentToday: sent.filter((time) => time >= sinceDay.getTime()).length,
    sentThisMonth: sent.filter((time) => time >= sinceMonth.getTime()).length,
  };
}

export function getDueCampaigns(now: Date, limit: number) {
  return getCampaigns()
    .filter((campaign) =>
      campaign.status === "sending"
      || (campaign.status === "scheduled" && campaign.scheduledAt && new Date(campaign.scheduledAt) <= now))
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
    .slice(0, limit);
}

// Demo mode runs in a single Node process, so an in-memory lease is
// enough to stop overlapping scheduler runs within that process.
const demoSendLeases = new Map<string, number>();

export function claimDemoCampaignSendLease(campaignId: string, seconds: number, now = Date.now()) {
  const until = demoSendLeases.get(campaignId);
  if (until !== undefined && until > now) return false;
  demoSendLeases.set(campaignId, now + seconds * 1000);
  return true;
}

export function releaseDemoCampaignSendLease(campaignId: string) {
  demoSendLeases.delete(campaignId);
}
