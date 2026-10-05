import { LeadScoreBand } from "./types";

/**
 * Transparent, configurable lead scoring model.
 *
 * This score is for internal prioritisation only. It never makes an
 * automated insurance decision and always shows a human-readable
 * explanation, per the platform's compliance rules. It does not use any
 * protected characteristic (race, religion, gender, health, disability,
 * nationality, political view, etc.) as an input.
 */

export interface ScoringInput {
  hasCompleteContactInfo: boolean;
  hasWebsite: boolean;
  insuranceProductCount: number;
  renewalWithinDays?: number | null;
  financialYearEndWithinDays?: number | null;
  highPriorityIndustry: boolean;
  employeeBand?: string;
  turnoverBand?: string;
  highIntentCampaignSource: boolean;
  isDirectReferral: boolean;
  isDuplicate: boolean;
  doNotContact: boolean;
  hasInvalidContactDetails: boolean;
}

export interface ScoringResult {
  score: number;
  band: LeadScoreBand;
  explanation: string;
}

export function scoreLead(input: ScoringInput): ScoringResult {
  let score = 0;
  const reasons: string[] = [];

  if (input.hasCompleteContactInfo) {
    score += 15;
    reasons.push("provided complete contact information");
  }
  if (input.hasWebsite) {
    score += 5;
    reasons.push("provided an organisation website");
  }
  if (input.insuranceProductCount >= 2) {
    score += 15;
    reasons.push("selected multiple insurance products");
  } else if (input.insuranceProductCount === 1) {
    score += 8;
    reasons.push("selected a specific insurance need");
  }
  if (typeof input.renewalWithinDays === "number" && input.renewalWithinDays <= 45) {
    score += 15;
    reasons.push(`has a renewal date within ${input.renewalWithinDays} days`);
  }
  if (typeof input.financialYearEndWithinDays === "number" && input.financialYearEndWithinDays <= 60) {
    score += 10;
    reasons.push("has an approaching financial year-end");
  }
  if (input.highPriorityIndustry) {
    score += 8;
    reasons.push("operates in a high-priority industry");
  }
  if (["51-200", "200+"].includes(input.employeeBand ?? "")) {
    score += 8;
    reasons.push("has a larger employee headcount");
  } else if (["21-50"].includes(input.employeeBand ?? "")) {
    score += 4;
  }
  if (["R20 million - R50 million", "R50 million+"].includes(input.turnoverBand ?? "")) {
    score += 8;
    reasons.push("falls in a higher annual turnover band");
  }
  if (input.highIntentCampaignSource) {
    score += 10;
    reasons.push("came from a high-intent campaign source");
  }
  if (input.isDirectReferral) {
    score += 6;
    reasons.push("was a direct referral");
  }

  if (input.isDuplicate) {
    score -= 20;
  }
  if (input.hasInvalidContactDetails) {
    score -= 15;
  }
  if (input.doNotContact) {
    score = 0;
  }

  score = Math.max(0, Math.min(100, score));

  let band: LeadScoreBand;
  if (input.doNotContact) band = "low_priority";
  else if (score >= 70) band = "hot";
  else if (score >= 45) band = "warm";
  else if (score >= 20) band = "nurture";
  else band = "low_priority";

  const explanation = reasons.length
    ? `Lead scored ${score}/100 because the applicant ${reasons.join(", ")}.`
    : `Lead scored ${score}/100 based on limited information available at submission.`;

  return { score, band, explanation };
}

/**
 * Transparent, configurable opportunity scoring for the geographic hotspot
 * dashboard (Market Intelligence). Mirrors scoreLead() above: additive
 * points from named, documented reasons, always paired with a
 * human-readable explanation, and never fed a protected characteristic.
 *
 * growthRate/conversionRate are null when there is not enough history to
 * measure them (a brand-new area, or one with no won/lost leads yet) -
 * that case is scored as neutral, never as if growth or conversion were
 * zero, so a new hotspot is not unfairly penalised for lacking history.
 */

export interface HotspotScoringInput {
  leadVolume: number;
  minLeadThreshold: number;
  growthRate: number | null;
  conversionRate: number | null;
}

export interface HotspotScoringResult {
  score: number;
  explanation: string;
}

export function scoreHotspot(input: HotspotScoringInput): HotspotScoringResult {
  let score = 0;
  const reasons: string[] = [];

  // Volume (max 35): scaled against the area's own minimum-display
  // threshold, so the scale adapts if an admin changes it.
  if (input.leadVolume >= input.minLeadThreshold * 3) {
    score += 35;
    reasons.push(`generated a high volume of ${input.leadVolume} leads`);
  } else if (input.leadVolume >= input.minLeadThreshold * 2) {
    score += 25;
    reasons.push(`generated a strong volume of ${input.leadVolume} leads`);
  } else {
    score += 15;
    reasons.push(`met the minimum display threshold with ${input.leadVolume} leads`);
  }

  // Growth (max 35).
  if (input.growthRate === null) {
    score += 10;
    reasons.push("does not yet have enough prior-period history to measure growth");
  } else if (input.growthRate >= 0.25) {
    score += 35;
    reasons.push(`grew ${Math.round(input.growthRate * 100)}% over the prior period`);
  } else if (input.growthRate >= 0.05) {
    score += 22;
    reasons.push(`grew ${Math.round(input.growthRate * 100)}% over the prior period`);
  } else if (input.growthRate > -0.05) {
    score += 10;
    reasons.push("held a steady lead volume over the prior period");
  } else {
    reasons.push(`declined ${Math.round(Math.abs(input.growthRate) * 100)}% over the prior period`);
  }

  // Conversion (max 30).
  if (input.conversionRate === null) {
    score += 15;
    reasons.push("has no won or lost leads yet to measure a conversion rate from");
  } else if (input.conversionRate >= 0.4) {
    score += 30;
    reasons.push(`converted ${Math.round(input.conversionRate * 100)}% of its closed leads`);
  } else if (input.conversionRate >= 0.2) {
    score += 18;
    reasons.push(`converted ${Math.round(input.conversionRate * 100)}% of its closed leads`);
  } else if (input.conversionRate > 0) {
    score += 8;
    reasons.push(`converted ${Math.round(input.conversionRate * 100)}% of its closed leads`);
  } else {
    reasons.push("has not converted any closed leads yet");
  }

  score = Math.max(0, Math.min(100, score));

  const explanation = `Scored ${score}/100 because this area ${reasons.join(", ")}.`;

  return { score, explanation };
}
