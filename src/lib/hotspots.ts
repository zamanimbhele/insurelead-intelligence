import type { BusinessCoverInterest, GeoHotspot, HotspotLevel, InsuranceProduct, Lead } from "./types";
import { INSURANCE_NEED_LABELS, computeConversionRate, computeGrowthRate, mostFrequent } from "./aggregation-utils";
import { scoreOpportunity } from "./scoring";

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
    const { score, explanation } = scoreOpportunity({
      leadVolume: groupLeads.length,
      minLeadThreshold,
      growthRate,
      conversionRate,
      subjectLabel: "area",
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
