import { createHash } from "node:crypto";

import { INSURANCE_PRODUCTS } from "./constants.ts";
import type {
  BrokerSendingIdentity,
  Buyer,
  Campaign,
  CampaignContentVersion,
  ConsentRecord,
  Lead,
  LeadAllocation,
  MarketingSuppression,
} from "./types.ts";

export type CampaignAudienceDecision = {
  leadId: string;
  eligible: boolean;
  reasons: string[];
};

export type CampaignValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export function hashCampaignEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function evaluateCampaignAudience(input: {
  campaign: Campaign;
  buyer: Buyer | undefined;
  leads: Lead[];
  consents: Map<string, ConsentRecord | undefined>;
  allocations: LeadAllocation[];
  suppressions: MarketingSuppression[];
}): CampaignAudienceDecision[] {
  const { campaign, buyer, leads, consents, allocations, suppressions } = input;
  const suppressedEmails = new Set(
    suppressions
      .filter((item) => item.organisationId === campaign.organisationId)
      .map((item) => item.emailHash),
  );

  return leads.map((lead) => {
    const reasons: string[] = [];
    const consent = consents.get(lead.id);
    const rules = campaign.audienceRules;

    if (!buyer || buyer.id !== campaign.organisationId) {
      reasons.push("Broker organisation is unavailable");
    } else if (buyer.status !== "active" || buyer.onboardingStatus !== "approved" || !buyer.acceptsCampaigns) {
      reasons.push("Broker is not approved for campaigns");
    }
    if (!consent?.marketingConsent) reasons.push("Marketing consent is not recorded");
    if (lead.doNotContact) reasons.push("Lead is marked do not contact");
    if (suppressedEmails.has(hashCampaignEmail(lead.contactEmail))) reasons.push("Recipient is suppressed");
    if (!allocations.some((allocation) =>
      allocation.leadId === lead.id
      && allocation.buyerId === campaign.organisationId
      && allocation.status === "accepted"
    )) reasons.push("Lead is not accepted by this broker tenant");
    if (!lead.insuranceProducts.some((product) => campaign.insuranceProducts.includes(product))) {
      reasons.push("Lead product does not match the campaign");
    }
    if (rules.applicantTypes?.length && !rules.applicantTypes.includes(lead.applicantType)) {
      reasons.push("Applicant type is outside the campaign segment");
    }
    if (rules.provinces?.length && !rules.provinces.includes(lead.province)) {
      reasons.push("Province is outside the campaign segment");
    }
    if (rules.cities?.length && !rules.cities.includes(lead.city)) {
      reasons.push("City is outside the campaign segment");
    }
    if (rules.industries?.length && (!lead.industry || !rules.industries.includes(lead.industry))) {
      reasons.push("Industry is outside the campaign segment");
    }
    if (rules.minimumScore !== undefined && lead.score < rules.minimumScore) {
      reasons.push("Lead score is below the campaign minimum");
    }

    return { leadId: lead.id, eligible: reasons.length === 0, reasons };
  });
}

export function validateCampaign(input: {
  campaign: Campaign;
  buyer: Buyer | undefined;
  sendingIdentity: BrokerSendingIdentity | undefined;
  content: CampaignContentVersion | undefined;
  audience: CampaignAudienceDecision[];
}): CampaignValidationIssue[] {
  const { campaign, buyer, sendingIdentity, content, audience } = input;
  const issues: CampaignValidationIssue[] = [];
  const add = (code: string, severity: "error" | "warning", message: string) =>
    issues.push({ code, severity, message });

  if (!buyer || buyer.id !== campaign.organisationId) {
    add("broker_missing", "error", "The campaign broker organisation could not be loaded.");
  } else {
    if (buyer.status !== "active" || buyer.onboardingStatus !== "approved") {
      add("broker_inactive", "error", "The broker must be active and approved.");
    }
    if (!buyer.acceptsCampaigns) {
      add("campaign_permission", "error", "Campaign delivery is not enabled for this broker.");
    }
    const unapprovedProducts = campaign.insuranceProducts.filter(
      (product) => !buyer.insuranceProducts.includes(product),
    );
    if (unapprovedProducts.length) {
      add("product_permission", "error", "The campaign includes products outside the broker's approved appetite.");
    }
  }
  if (campaign.insuranceProducts.length === 0) {
    add("products_missing", "error", "Select at least one insurance product.");
  }
  if (!sendingIdentity || sendingIdentity.organisationId !== campaign.organisationId) {
    add("sender_missing", "error", "Select a sending identity owned by this broker.");
  } else if (sendingIdentity.status !== "verified") {
    add("sender_unverified", "error", "The selected sending identity is not verified.");
  }
  if (!content || content.version !== campaign.currentContentVersion) {
    add("content_missing", "error", "Generate a current campaign content version.");
  } else {
    if (!content.subject.trim() || content.subject.length > 150) {
      add("subject_invalid", "error", "The subject must be between 1 and 150 characters.");
    }
    if (!content.textBody.includes("{{unsubscribe_url}}") || !content.htmlBody.includes("{{unsubscribe_url}}")) {
      add("unsubscribe_missing", "error", "Both content formats must include the unsubscribe link.");
    }
    if (/\b(guaranteed savings|lowest price|instant approval|risk[- ]free)\b/i.test(`${content.subject} ${content.textBody}`)) {
      add("prohibited_claim", "error", "Content contains an unsupported promotional or outcome claim.");
    }
  }

  const eligibleCount = audience.filter((item) => item.eligible).length;
  if (eligibleCount === 0) {
    add("audience_empty", "error", "No consented, allocated recipients match this campaign.");
  }
  if (eligibleCount > 500) {
    add("pilot_volume", "warning", "Audience exceeds the 500-recipient pilot review threshold.");
  }
  if (campaign.contactBasis !== "marketing_consent") {
    add("contact_basis", "error", "The pilot supports explicit marketing consent only.");
  }
  return issues;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function generateCampaignCopy(input: {
  campaign: Campaign;
  brokerName: string;
  keyMessage: string;
  callToActionLabel: string;
  callToActionUrl: string;
}): Omit<CampaignContentVersion, "id" | "campaignId" | "version" | "generatedBy" | "createdAt"> {
  const productList = input.campaign.insuranceProducts.map((id) =>
    INSURANCE_PRODUCTS.find((product) => product.value === id)?.label ?? id.replaceAll("_", " ")
  ).join(", ");
  const objectiveLead: Record<Campaign["objective"], string> = {
    awareness: "Explore insurance options aligned with your needs",
    renewal_reminder: "Prepare for your upcoming insurance review",
    cross_sell: "Review whether your current protection covers what matters",
    quote_follow_up: "Continue your insurance enquiry",
    seasonal: "Review your cover for the season ahead",
  };
  const subject = `${objectiveLead[input.campaign.objective]}: ${productList}`.slice(0, 150);
  const broker = escapeHtml(input.brokerName);
  const message = escapeHtml(input.keyMessage);
  const cta = escapeHtml(input.callToActionLabel);
  const ctaUrl = escapeHtml(input.callToActionUrl);
  const products = escapeHtml(productList);
  const preheader = `Information about ${productList} from ${input.brokerName}`.slice(0, 200);
  const textBody = [
    "Hello {{first_name}},",
    "",
    input.keyMessage,
    "",
    `Products: ${productList}`,
    `${input.callToActionLabel}: ${input.callToActionUrl}`,
    "",
    "Insurance information only. This message is not advice, a quote, or confirmation of cover.",
    `Sent by ${input.brokerName}.`,
    "Unsubscribe: {{unsubscribe_url}}",
  ].join("\n");
  const htmlBody = [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:auto">',
    `<p>Hello {{first_name}},</p><p>${message}</p>`,
    `<p><strong>Products:</strong> ${products}</p>`,
    `<p><a href="${ctaUrl}" style="display:inline-block;background:#2848e8;color:white;padding:12px 18px;border-radius:6px;text-decoration:none">${cta}</a></p>`,
    '<p style="font-size:12px;color:#64748b">Insurance information only. This message is not advice, a quote, or confirmation of cover.</p>',
    `<p style="font-size:12px;color:#64748b">Sent by ${broker}. <a href="{{unsubscribe_url}}">Unsubscribe</a></p>`,
    "</div>",
  ].join("");
  return { subject, preheader, textBody, htmlBody };
}

export function renderCampaignContent(
  content: CampaignContentVersion,
  input: { firstName: string; unsubscribeUrl: string },
) {
  const replaceText = (value: string) => value
    .replaceAll("{{first_name}}", input.firstName)
    .replaceAll("{{unsubscribe_url}}", input.unsubscribeUrl);
  const replaceHtml = (value: string) => value
    .replaceAll("{{first_name}}", escapeHtml(input.firstName))
    .replaceAll("{{unsubscribe_url}}", escapeHtml(input.unsubscribeUrl));
  return {
    subject: replaceText(content.subject),
    preheader: replaceText(content.preheader),
    textBody: replaceText(content.textBody),
    htmlBody: replaceHtml(content.htmlBody),
  };
}

export function summariseAudience(decisions: CampaignAudienceDecision[]) {
  const exclusionReasons = decisions
    .filter((item) => !item.eligible)
    .flatMap((item) => item.reasons)
    .reduce<Record<string, number>>((counts, reason) => {
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {});
  return {
    evaluated: decisions.length,
    eligible: decisions.filter((item) => item.eligible).length,
    excluded: decisions.filter((item) => !item.eligible).length,
    exclusionReasons,
  };
}
