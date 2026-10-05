import type { BusinessCoverInterest, IndustryOpportunity, InsuranceProduct, Lead } from "./types";
import { RENEWAL_URGENCY_WINDOW_DAYS } from "./constants";
import {
  INSURANCE_NEED_LABELS,
  computeConversionRate,
  computeGrowthRate,
  daysUntilNextOccurrenceOfMonth,
  mostFrequent,
} from "./aggregation-utils";
import { scoreOpportunity } from "./scoring";

/**
 * Industry opportunity dashboard (Market Intelligence). Computed live from
 * leads on each request, same scoping as the geographic hotspot dashboard
 * (src/lib/hotspots.ts) - no stored snapshot table yet.
 *
 * Only leads with an industry set are grouped (individual-applicant leads
 * never have one - see types.ts). An industry below minLeadThreshold is
 * never returned, the same minimum-data-volume protection the brief asks
 * for geographic hotspots, applied here too rather than inventing a
 * second, industry-specific threshold.
 */

function computeRenewalUrgency(leads: Lead[]): { renewalDataCount: number; renewingSoonCount: number } {
  let renewalDataCount = 0;
  let renewingSoonCount = 0;
  for (const lead of leads) {
    if (!lead.renewalMonth) continue;
    const daysUntil = daysUntilNextOccurrenceOfMonth(lead.renewalMonth);
    if (daysUntil === null) continue;
    renewalDataCount += 1;
    if (daysUntil <= RENEWAL_URGENCY_WINDOW_DAYS) renewingSoonCount += 1;
  }
  return { renewalDataCount, renewingSoonCount };
}

// Transparent, derived from the same growth/conversion numbers already
// shown - never a separate, unexplained judgement. An industry with too
// little data to judge fairly (no closed leads, or no prior-period
// history) is never flagged just for lacking data.
function assessMarketingAttention(
  growthRate: number | null,
  conversionRate: number | null,
): { needsMarketingAttention: boolean; attentionReason?: string } {
  const reasons: string[] = [];
  if (conversionRate !== null && conversionRate < 0.15) {
    reasons.push(`converting only ${Math.round(conversionRate * 100)}% of its closed leads`);
  }
  if (growthRate !== null && growthRate < -0.1) {
    reasons.push(`declining ${Math.round(Math.abs(growthRate) * 100)}% over the prior period`);
  }
  if (reasons.length === 0) return { needsMarketingAttention: false };
  return { needsMarketingAttention: true, attentionReason: `This industry is ${reasons.join(" and ")}.` };
}

export function computeIndustryOpportunities(leads: Lead[], minLeadThreshold: number): IndustryOpportunity[] {
  const groups = new Map<string, Lead[]>();
  for (const lead of leads) {
    if (!lead.industry) continue;
    const existing = groups.get(lead.industry);
    if (existing) existing.push(lead);
    else groups.set(lead.industry, [lead]);
  }

  const computedAt = new Date().toISOString();
  const opportunities: IndustryOpportunity[] = [];

  for (const [industry, groupLeads] of groups.entries()) {
    if (groupLeads.length < minLeadThreshold) continue;

    const growthRate = computeGrowthRate(groupLeads);
    const conversionRate = computeConversionRate(groupLeads);
    const { score, explanation } = scoreOpportunity({
      leadVolume: groupLeads.length,
      minLeadThreshold,
      growthRate,
      conversionRate,
      subjectLabel: "industry",
    });

    const { renewalDataCount, renewingSoonCount } = computeRenewalUrgency(groupLeads);

    const topNeedValue = mostFrequent(
      groupLeads.flatMap((lead) => [
        ...((lead.businessCoverInterests ?? []) as (BusinessCoverInterest | undefined)[]),
        ...((lead.insuranceProducts ?? []) as (InsuranceProduct | undefined)[]),
      ]),
    );

    const { needsMarketingAttention, attentionReason } = assessMarketingAttention(growthRate, conversionRate);

    opportunities.push({
      industry,
      leadVolume: groupLeads.length,
      growthRate,
      conversionRate,
      renewalDataCount,
      renewingSoonCount,
      topCoverNeed: topNeedValue ? INSURANCE_NEED_LABELS[topNeedValue] ?? topNeedValue : undefined,
      needsMarketingAttention,
      attentionReason,
      opportunityScore: score,
      opportunityExplanation: explanation,
      computedAt,
    });
  }

  return opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
