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
  employeeBand: string;
  turnoverBand: string;
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
    reasons.push("provided a business website");
  }
  if (input.insuranceProductCount >= 2) {
    score += 15;
    reasons.push("selected multiple cover requirements");
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
  if (["51-200", "200+"].includes(input.employeeBand)) {
    score += 8;
    reasons.push("has a larger employee headcount");
  } else if (["21-50"].includes(input.employeeBand)) {
    score += 4;
  }
  if (["R20 million - R50 million", "R50 million+"].includes(input.turnoverBand)) {
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
    ? `Lead scored ${score}/100 because the business ${reasons.join(", ")}.`
    : `Lead scored ${score}/100 based on limited information available at submission.`;

  return { score, band, explanation };
}
