// Sender reputation safeguards (individual advisors plan, phase 5).
// Everyone on the platform sending domain shares its reputation, so a
// sender whose recipients bounce or complain too often is paused, and new
// platform senders start on lower daily limits. Pure, unit-tested.
import type { CampaignRecipient } from "./types.ts";

export const REPUTATION_WINDOW_DAYS = 30;
// Bounces: judged once there is enough volume to be fair.
export const BOUNCE_MIN_SENDS = 50;
export const BOUNCE_RATE_LIMIT = 0.05; // 5%
// Complaints: mailbox providers act from about 0.3%. Two complaints are
// needed before a pause, so a single one never stops a small sender.
export const COMPLAINT_RATE_LIMIT = 0.003; // 0.3%
export const COMPLAINT_MIN_COUNT = 2;

// Statuses that mean an email actually left for the recipient.
const DISPATCHED: CampaignRecipient["status"][] = ["sent", "delivered", "bounced", "complained"];

export type SenderReputation = {
  sent: number;
  bounced: number;
  complained: number;
  bounceRate: number;
  complaintRate: number;
};

export function senderReputation(recipients: readonly CampaignRecipient[], now = new Date()): SenderReputation {
  const since = now.getTime() - REPUTATION_WINDOW_DAYS * 86_400_000;
  const recent = recipients.filter((recipient) =>
    DISPATCHED.includes(recipient.status) && recipient.sentAt && new Date(recipient.sentAt).getTime() >= since);
  const bounced = recent.filter((recipient) => recipient.status === "bounced").length;
  const complained = recent.filter((recipient) => recipient.status === "complained").length;
  return {
    sent: recent.length,
    bounced,
    complained,
    bounceRate: recent.length ? bounced / recent.length : 0,
    complaintRate: recent.length ? complained / recent.length : 0,
  };
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

// Why this sender should be paused, or null if it is fine.
export function pauseReason(stats: SenderReputation): string | null {
  if (stats.complained >= COMPLAINT_MIN_COUNT && stats.complaintRate > COMPLAINT_RATE_LIMIT) {
    return `Paused automatically: ${stats.complained} spam complaints (${percent(stats.complaintRate)}) in the last ${REPUTATION_WINDOW_DAYS} days, above the ${percent(COMPLAINT_RATE_LIMIT)} limit.`;
  }
  if (stats.sent >= BOUNCE_MIN_SENDS && stats.bounceRate > BOUNCE_RATE_LIMIT) {
    return `Paused automatically: ${stats.bounced} bounces (${percent(stats.bounceRate)}) in the last ${REPUTATION_WINDOW_DAYS} days, above the ${percent(BOUNCE_RATE_LIMIT)} limit.`;
  }
  return null;
}

// Daily cap for a new platform sender while it builds a reputation.
// Undefined once warmed up (the broker's own limit then applies).
export const WARM_UP_STEPS: { untilDay: number; dailyCap: number }[] = [
  { untilDay: 7, dailyCap: 50 },
  { untilDay: 14, dailyCap: 100 },
  { untilDay: 30, dailyCap: 250 },
];

export function warmUpDailyCap(createdAt: string, now = new Date()): number | undefined {
  const ageDays = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  return WARM_UP_STEPS.find((step) => ageDays < step.untilDay)?.dailyCap;
}

// Demo mode has no platform domain of its own.
export const DEMO_PLATFORM_SENDING_DOMAIN = "mail.insurelead-demo.example-synthetic.co.za";
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function platformSendingDomain(configured: string | undefined, demo: boolean): string | null {
  if (demo) return DEMO_PLATFORM_SENDING_DOMAIN;
  const domain = configured?.trim().toLowerCase();
  return domain && DOMAIN_PATTERN.test(domain) ? domain : null;
}

// The from-address a platform identity uses (same rule as the database).
export function platformSenderAddress(input: { displayName: string; organisationId: string; domain: string }) {
  const slug = input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "advisor";
  return {
    fromName: `${input.displayName.trim()} via InsureLead`,
    fromEmail: `${slug}-${input.organisationId.replace(/-/g, "").slice(0, 8)}@${input.domain}`,
  };
}
