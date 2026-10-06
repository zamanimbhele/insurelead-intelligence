import type { FinancialYearCampaignPlan, Lead } from "./types";
import { FYE_PLANNING_WINDOW_DAYS } from "./constants";
import {
  INSURANCE_NEED_LABELS,
  MONTH_NAMES,
  computeConversionRate,
  daysUntilNextOccurrenceOfMonth,
  mostFrequent,
} from "./aggregation-utils";

/**
 * Financial-Year-End Campaign Planner (project brief section 8). Businesses
 * capture only a financial-year-end *month name* on their lead record
 * (Lead.financialYearEndMonth - see the public consultation form), never a
 * day or year, and the brief is explicit that not every business has a
 * March year-end - so everything here groups by that one month field
 * rather than assuming a single national cycle.
 */

export interface FyeMonthCalendarEntry {
  month: string;
  leadVolume: number;
  daysUntilNextOccurrence: number;
  // True once this month's next occurrence falls inside
  // FYE_PLANNING_WINDOW_DAYS - the "act now" signal the calendar highlights.
  withinPlanningWindow: boolean;
  plans: FinancialYearCampaignPlan[];
}

// One row per calendar month (always 12, even at zero leads - an empty
// month is still a fact worth showing on a calendar, not a row to hide).
export function computeFyeCalendar(leads: Lead[], plans: FinancialYearCampaignPlan[]): FyeMonthCalendarEntry[] {
  return MONTH_NAMES.map((month) => {
    const monthLeads = leads.filter((lead) => lead.financialYearEndMonth === month);
    const daysUntilNextOccurrence = daysUntilNextOccurrenceOfMonth(month) ?? 0;
    return {
      month,
      leadVolume: monthLeads.length,
      daysUntilNextOccurrence,
      withinPlanningWindow: daysUntilNextOccurrence <= FYE_PLANNING_WINDOW_DAYS,
      plans: plans.filter((plan) => plan.fyeMonth === month && plan.status !== "cancelled"),
    };
  });
}

export interface FyeBreakdownRow {
  label: string;
  leadVolume: number;
}

function groupCount(leads: Lead[], pick: (lead: Lead) => string | undefined): FyeBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const value = pick(lead);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, leadVolume]) => ({ label, leadVolume }))
    .sort((a, b) => b.leadVolume - a.leadVolume);
}

export interface FyeMonthBreakdown {
  month: string;
  totalLeads: number;
  conversionRate: number | null;
  topInsuranceNeed?: string;
  byIndustry: FyeBreakdownRow[];
  byProvince: FyeBreakdownRow[];
}

// "Track campaign results by month, sector, location, and insurance need"
// (brief section 8) for one selected FYE month - sector -> byIndustry,
// location -> byProvince. Conversion rate reuses the same won/(won+lost)
// convention as every other Market Intelligence view (null, never a
// fabricated 0%, when nothing in the month has closed yet).
export function computeFyeMonthBreakdown(leads: Lead[], month: string): FyeMonthBreakdown {
  const monthLeads = leads.filter((lead) => lead.financialYearEndMonth === month);
  const needValues = monthLeads.flatMap((lead) => [
    ...(lead.businessCoverInterests ?? []),
    ...lead.insuranceProducts,
  ]);
  const topNeedKey = mostFrequent(needValues);

  return {
    month,
    totalLeads: monthLeads.length,
    conversionRate: computeConversionRate(monthLeads),
    topInsuranceNeed: topNeedKey ? (INSURANCE_NEED_LABELS[topNeedKey] ?? topNeedKey) : undefined,
    byIndustry: groupCount(monthLeads, (lead) => lead.industry),
    byProvince: groupCount(monthLeads, (lead) => lead.province),
  };
}

// Leads eligible for a bulk broker follow-up task batch for a given FYE
// month - never do-not-contact, never already redacted (deletedAt set).
export function leadsForFyeFollowUp(leads: Lead[], month: string): Lead[] {
  return leads.filter(
    (lead) => lead.financialYearEndMonth === month && !lead.doNotContact && !lead.deletedAt,
  );
}
