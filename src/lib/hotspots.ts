import type { BusinessCoverInterest, GeoHotspot, HotspotLevel, InsuranceProduct, Lead } from "./types";
import { BUSINESS_COVER_OPTIONS, HOTSPOT_PRIOR_WINDOW_DAYS, HOTSPOT_RECENT_WINDOW_DAYS, INSURANCE_PRODUCTS } from "./constants";
import { scoreHotspot } from "./scoring";

/**
 * Geographic hotspot dashboard (Market Intelligence). Computed live from
 * leads on each request - there is no stored hotspot_snapshots table yet
 * (see BACKLOG.md), so "computedAt" below means "as of this page load",
 * not "last refreshed by a background job".
 *
 * Every number here comes only from leads already captured through this
 * platform's own consented intake - no scraped or third-party data, and
 * nothing below the caller-supplied minLeadThreshold is ever returned, so
 * a small, potentially identifiable area is never surfaced.
 */

const INSURANCE_NEED_LABELS: Record<string, string> = {
  ...Object.fromEntries(BUSINESS_COVER_OPTIONS.map((option) => [option.value, option.label])),
  ...Object.fromEntries(INSURANCE_PRODUCTS.map((product) => [product.value, product.label])),
};

function mostFrequent(values: (string | undefined)[]): string | undefined {
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

function computeGrowthRate(leads: Lead[]): number | null {
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

function computeConversionRate(leads: Lead[]): number | null {
  const wonCount = leads.filter((lead) => lead.status === "won").length;
  const lostCount = leads.filter((lead) => lead.status === "lost").length;
  const closedCount = wonCount + lostCount;
  if (closedCount === 0) return null;
  return wonCount / closedCount;
}

function groupKey(lead: Lead, level: HotspotLevel): string | undefined {
  if (level === "province") return lead.province;
  if (level === "municipality") return lead.city ? `${lead.province}|${lead.city}` : undefined;
  return lead.suburb && lead.city ? `${lead.province}|${lead.city}|${lead.suburb}` : undefined;
}

function groupLabel(lead: Lead, level: HotspotLevel): string {
  if (level === "province") return lead.province;
  if (level === "municipality") return `${lead.province} - ${lead.city}`;
  return `${lead.province} - ${lead.city} - ${lead.suburb}`;
}

export function computeGeoHotspots(leads: Lead[], level: HotspotLevel, minLeadThreshold: number): GeoHotspot[] {
  const groups = new Map<string, Lead[]>();
  for (const lead of leads) {
    const key = groupKey(lead, level);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) existing.push(lead);
    else groups.set(key, [lead]);
  }

  const computedAt = new Date().toISOString();
  const hotspots: GeoHotspot[] = [];

  for (const groupLeads of groups.values()) {
    if (groupLeads.length < minLeadThreshold) continue;

    const sample = groupLeads[0];
    const growthRate = computeGrowthRate(groupLeads);
    const conversionRate = computeConversionRate(groupLeads);
    const { score, explanation } = scoreHotspot({
      leadVolume: groupLeads.length,
      minLeadThreshold,
      growthRate,
      conversionRate,
    });

    const topIndustry = mostFrequent(groupLeads.map((lead) => lead.industry));
    const topNeedValue = mostFrequent(
      groupLeads.flatMap((lead) => [
        ...((lead.businessCoverInterests ?? []) as (BusinessCoverInterest | undefined)[]),
        ...((lead.insuranceProducts ?? []) as (InsuranceProduct | undefined)[]),
      ]),
    );
    const topCampaignSource = mostFrequent(groupLeads.map((lead) => lead.campaignSource));

    hotspots.push({
      level,
      label: groupLabel(sample, level),
      province: sample.province,
      city: level === "province" ? undefined : sample.city,
      suburb: level === "suburb" ? sample.suburb : undefined,
      leadVolume: groupLeads.length,
      growthRate,
      conversionRate,
      topIndustry,
      topInsuranceNeed: topNeedValue ? INSURANCE_NEED_LABELS[topNeedValue] ?? topNeedValue : undefined,
      topCampaignSource,
      opportunityScore: score,
      opportunityExplanation: explanation,
      computedAt,
    });
  }

  return hotspots.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
