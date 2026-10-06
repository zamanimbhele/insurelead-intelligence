import type { Lead } from "./types";
import { BUSINESS_COVER_OPTIONS, HOTSPOT_PRIOR_WINDOW_DAYS, HOTSPOT_RECENT_WINDOW_DAYS, INSURANCE_PRODUCTS } from "./constants";

/**
 * Shared, grouping-agnostic helpers for the Market Intelligence aggregate
 * dashboards (geographic hotspots - src/lib/hotspots.ts, and industry
 * opportunity - src/lib/industries.ts). Nothing here is specific to how
 * the leads were grouped, only to what can be computed once they are.
 */

export const INSURANCE_NEED_LABELS: Record<string, string> = {
  ...Object.fromEntries(BUSINESS_COVER_OPTIONS.map((option) => [option.value, option.label])),
  ...Object.fromEntries(INSURANCE_PRODUCTS.map((product) => [product.value, product.label])),
};

export function mostFrequent(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function daysAgo(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

// Trailing HOTSPOT_RECENT_WINDOW_DAYS vs. the equal-length window
// immediately before it. Null when there is no prior-period history to
// compare against, rather than a fabricated 0%/100% - see the constant's
// own comment in constants.ts for why 60/60 was picked.
export function computeGrowthRate(leads: Lead[]): number | null {
  let recentCount = 0;
  let priorCount = 0;
  for (const lead of leads) {
    const age = daysAgo(lead.createdAt);
    if (age <= HOTSPOT_RECENT_WINDOW_DAYS) recentCount += 1;
    else if (age <= HOTSPOT_RECENT_WINDOW_DAYS + HOTSPOT_PRIOR_WINDOW_DAYS) priorCount += 1;
  }
  if (priorCount === 0) return null;
  return (recentCount - priorCount) / priorCount;
}

// won / (won + lost). Null when nothing in the group has closed yet,
// rather than a fabricated 0%.
export function computeConversionRate(leads: Lead[]): number | null {
  const wonCount = leads.filter((lead) => lead.status === "won").length;
  const lostCount = leads.filter((lead) => lead.status === "lost").length;
  const closedCount = wonCount + lostCount;
  if (closedCount === 0) return null;
  return wonCount / closedCount;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Leads only ever capture a renewal/financial-year-end *month name*, never
// a day or year (see Lead.renewalMonth / Lead.financialYearEndMonth), so
// "how soon" can only ever mean "how many days until the next occurrence
// of this calendar month" - this is that one calculation, shared so it is
// never reimplemented slightly differently in two places. Unknown/
// unparseable month names return null rather than throwing.
export function daysUntilNextOccurrenceOfMonth(monthName: string, from: Date = new Date()): number | null {
  const monthIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase() === monthName.trim().toLowerCase());
  if (monthIndex === -1) return null;

  const startOfFromMonth = new Date(from.getFullYear(), from.getMonth(), 1);
  let target = new Date(from.getFullYear(), monthIndex, 1);
  // The current calendar month counts as "due now" (0 days), not a full
  // year away - only a month that has already passed this year rolls over
  // to next year.
  if (target < startOfFromMonth) target = new Date(from.getFullYear() + 1, monthIndex, 1);

  return Math.round((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
