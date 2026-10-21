// Campaign send quotas and South African calendar boundaries.
//
// Quotas are per broker tenant (buyer_preferences.campaign_daily_send_limit
// / campaign_monthly_send_limit) and count every campaign email actually
// handed to the provider (a recipient with a sentAt) across all of that
// tenant's campaigns. "Today" and "this month" are South African calendar
// periods: SAST is a fixed UTC+02:00 with no daylight saving, so the
// boundaries are a plain offset - no time zone database needed.

export const SAST_OFFSET_MINUTES = 120;
const SAST_OFFSET_MS = SAST_OFFSET_MINUTES * 60_000;

export const DEFAULT_CAMPAIGN_DAILY_SEND_LIMIT = 200;
export const DEFAULT_CAMPAIGN_MONTHLY_SEND_LIMIT = 3000;

// Scheduling window: far enough ahead to plan a seasonal send, close
// enough that an approval is not quietly acted on months later.
export const MAX_SCHEDULE_AHEAD_DAYS = 90;

export type CampaignSendLimits = { dailyLimit: number; monthlyLimit: number };
export type CampaignSendUsage = { sentToday: number; sentThisMonth: number };

export type CampaignQuotaStatus = CampaignSendLimits & CampaignSendUsage & {
  remainingToday: number;
  remainingThisMonth: number;
  remaining: number;
  exhaustedBy?: "daily" | "monthly";
};

// Start of the current SAST calendar day and month, as UTC instants.
export function sastPeriodStarts(now: Date): { dayStart: Date; monthStart: Date } {
  const local = new Date(now.getTime() + SAST_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  return {
    dayStart: new Date(Date.UTC(y, m, d) - SAST_OFFSET_MS),
    monthStart: new Date(Date.UTC(y, m, 1) - SAST_OFFSET_MS),
  };
}

// The SAST calendar date (YYYY-MM-DD) an instant falls on. Used to log a
// quota deferral at most once per campaign per day.
export function sastDateKey(instant: Date): string {
  return new Date(instant.getTime() + SAST_OFFSET_MS).toISOString().slice(0, 10);
}

export function quotaStatus(limits: CampaignSendLimits, usage: CampaignSendUsage): CampaignQuotaStatus {
  const remainingToday = Math.max(0, limits.dailyLimit - usage.sentToday);
  const remainingThisMonth = Math.max(0, limits.monthlyLimit - usage.sentThisMonth);
  const remaining = Math.min(remainingToday, remainingThisMonth);
  const exhaustedBy = remaining > 0
    ? undefined
    : remainingThisMonth === 0 ? "monthly" : "daily";
  return { ...limits, ...usage, remainingToday, remainingThisMonth, remaining, exhaustedBy };
}

// How many recipients one batch may send: the requested size, capped by
// the deployment-wide CAMPAIGN_MAX_BATCH_SIZE (1-100) and by the tenant's
// remaining quota.
export function batchAllowance(input: { requested: number; configuredMaximum: number; quotaRemaining: number }) {
  return Math.max(0, Math.min(input.requested, input.configuredMaximum, input.quotaRemaining));
}

export function configuredMaximumBatchSize(raw: string | undefined) {
  const parsed = Number(raw ?? 25);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(100, Math.floor(parsed)) : 25;
}

// <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" with no zone.
// The dashboard labels it as SAST, so interpret it that way.
export function parseSastLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi) - SAST_OFFSET_MS;
  const result = new Date(utc);
  // Reject rollovers such as 2026-02-31.
  const roundTrip = new Date(utc + SAST_OFFSET_MS);
  if (roundTrip.getUTCMonth() !== mo - 1 || roundTrip.getUTCDate() !== d) return null;
  return result;
}

export function formatSast(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const local = new Date(date.getTime() + SAST_OFFSET_MS).toISOString();
  return `${local.slice(0, 10)} ${local.slice(11, 16)} SAST`;
}

export function validateScheduleTime(scheduledAt: Date, now: Date): string | null {
  if (Number.isNaN(scheduledAt.getTime())) return "Choose a valid send date and time";
  // A minute of grace so "send now" from a form submitted at :59 still passes.
  if (scheduledAt.getTime() < now.getTime() - 60_000) return "The send time must not be in the past";
  if (scheduledAt.getTime() > now.getTime() + MAX_SCHEDULE_AHEAD_DAYS * 86_400_000) {
    return `The send time must be within ${MAX_SCHEDULE_AHEAD_DAYS} days`;
  }
  return null;
}
