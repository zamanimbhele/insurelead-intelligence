import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateCampaignAudience,
  generateCampaignCopy,
  hashCampaignEmail,
  renderCampaignContent,
  validateCampaign,
} from "../src/lib/campaign-policy.ts";
import {
  createCampaignUnsubscribeToken,
  verifyCampaignUnsubscribeToken,
} from "../src/lib/campaign-unsubscribe.ts";
import type {
  BrokerSendingIdentity,
  Buyer,
  Campaign,
  ConsentRecord,
  Lead,
  LeadAllocation,
} from "../src/lib/types.ts";

const organisationId = "buyer_campaign_test";
const lead: Lead = {
  id: "lead_campaign_test",
  applicantType: "individual",
  province: "Gauteng",
  city: "Johannesburg",
  insuranceProducts: ["motor_insurance"],
  currentInsuranceStatus: "reviewing_existing_cover",
  preferredContactChannel: "email",
  contactFullName: "Synthetic Recipient",
  contactEmail: "recipient@example.test",
  contactMobile: "0820000000",
  status: "qualified",
  score: 65,
  scoreBand: "warm",
  scoreExplanation: "Synthetic campaign policy assertion",
  utm: {},
  doNotContact: false,
  createdAt: "2026-09-11T08:00:00.000Z",
};
const buyer: Buyer = {
  id: organisationId,
  organisationName: "Synthetic Campaign Broker",
  buyerType: "broker",
  status: "active",
  onboardingStatus: "approved",
  provinces: ["Gauteng"],
  cities: [],
  industries: [],
  insuranceProducts: ["motor_insurance"],
  minimumScore: 20,
  dailyLeadCapacity: 25,
  contactSlaHours: 4,
  acceptsSharedLeads: false,
  acceptsCampaigns: true,
  contactEmail: "broker@example.test",
};
const campaign: Campaign = {
  id: "campaign_policy_test",
  organisationId,
  name: "Synthetic motor review",
  objective: "renewal_reminder",
  insuranceProducts: ["motor_insurance"],
  audienceRules: { applicantTypes: ["individual"], provinces: ["Gauteng"], minimumScore: 30 },
  contactBasis: "marketing_consent",
  sendingIdentityId: "identity_campaign_test",
  status: "draft",
  currentContentVersion: 1,
  createdBy: "campaign_test",
  createdAt: "2026-09-11T08:00:00.000Z",
  updatedAt: "2026-09-11T08:00:00.000Z",
};
const consent: ConsentRecord = {
  leadId: lead.id,
  privacyNoticeAccepted: true,
  contactConsent: true,
  marketingConsent: true,
  partnerSharingConsent: true,
  maxPartnerRecipients: 1,
  accuracyConfirmed: true,
  nonBindingAcknowledged: true,
  consentWordingVersion: "campaign-test",
  sourceUrl: "https://example.test",
  timestamp: "2026-09-11T08:00:00.000Z",
};
const allocation: LeadAllocation = {
  id: "allocation_campaign_test",
  leadId: lead.id,
  buyerId: organisationId,
  status: "accepted",
  priceCents: 0,
  exclusive: true,
  allocatedAt: "2026-09-11T08:00:00.000Z",
  acceptedAt: "2026-09-11T08:05:00.000Z",
};
const sendingIdentity: BrokerSendingIdentity = {
  id: "identity_campaign_test",
  organisationId,
  domain: "example.test",
  fromName: "Synthetic Campaign Broker",
  fromEmail: "insurance@example.test",
  provider: "resend",
  status: "verified",
  isDefault: true,
  createdAt: "2026-09-11T08:00:00.000Z",
};
const generated = generateCampaignCopy({
  campaign,
  brokerName: buyer.organisationName,
  keyMessage: "It may be time to review whether your current motor protection still fits your needs.",
  callToActionLabel: "Review your options",
  callToActionUrl: "https://example.test/motor",
});
const content = {
  ...generated,
  id: "content_campaign_test",
  campaignId: campaign.id,
  version: 1,
  generatedBy: "campaign_test",
  createdAt: "2026-09-11T08:10:00.000Z",
};

const audience = evaluateCampaignAudience({
  campaign,
  buyer,
  leads: [lead],
  consents: new Map([[lead.id, consent]]),
  allocations: [allocation],
  suppressions: [],
});
assert.equal(audience[0].eligible, true);
assert.equal(validateCampaign({ campaign, buyer, sendingIdentity, content, audience }).length, 0);
assert(generated.textBody.includes("{{unsubscribe_url}}"));
assert(generated.htmlBody.includes("not advice"));
const rendered = renderCampaignContent(content, {
  firstName: "<script>alert(1)</script>",
  unsubscribeUrl: "https://example.test/unsubscribe?token=safe",
});
assert(!rendered.htmlBody.includes("<script>"));
assert(rendered.htmlBody.includes("&lt;script&gt;"));

const unsubscribeToken = createCampaignUnsubscribeToken({
  campaignId: campaign.id,
  organisationId,
  leadId: lead.id,
});
assert.equal(verifyCampaignUnsubscribeToken(unsubscribeToken)?.leadId, lead.id);
assert.equal(verifyCampaignUnsubscribeToken(`${unsubscribeToken}.unexpected`), null);

const noConsent = evaluateCampaignAudience({
  campaign,
  buyer,
  leads: [lead],
  consents: new Map([[lead.id, { ...consent, marketingConsent: false }]]),
  allocations: [allocation],
  suppressions: [],
});
assert.equal(noConsent[0].eligible, false);
assert(noConsent[0].reasons.includes("Marketing consent is not recorded"));

const wrongTenant = evaluateCampaignAudience({
  campaign,
  buyer,
  leads: [lead],
  consents: new Map([[lead.id, consent]]),
  allocations: [{ ...allocation, buyerId: "another_broker" }],
  suppressions: [],
});
assert.equal(wrongTenant[0].eligible, false);
assert(wrongTenant[0].reasons.includes("Lead is not accepted by this broker tenant"));

const suppressed = evaluateCampaignAudience({
  campaign,
  buyer,
  leads: [lead],
  consents: new Map([[lead.id, consent]]),
  allocations: [allocation],
  suppressions: [{
    id: "suppression_test",
    organisationId,
    leadId: lead.id,
    emailHash: hashCampaignEmail(lead.contactEmail),
    reason: "recipient_request",
    createdAt: "2026-09-11T08:15:00.000Z",
  }],
});
assert.equal(suppressed[0].eligible, false);
assert(suppressed[0].reasons.includes("Recipient is suppressed"));

const migration = readFileSync(
  new URL("../supabase/migrations/202609110002_campaign_generation_mcp.sql", import.meta.url),
  "utf8",
);
for (const requiredControl of [
  "campaign_content_versions",
  "campaign_approvals",
  "campaign_recipients",
  "marketing_suppressions",
  "approve_campaign_content",
  "prepare_campaign_recipients",
  "Campaign content, approval, and delivery history is immutable",
]) {
  assert(migration.includes(requiredControl), `Missing campaign control: ${requiredControl}`);
}

const campaignTools = readFileSync(new URL("../src/mcp/campaign-tools.ts", import.meta.url), "utf8");
for (const tool of [
  "create_campaign_draft",
  "generate_campaign_content",
  "validate_campaign",
  "preview_campaign",
  "send_test_campaign",
  "approve_campaign",
  "launch_campaign",
  "pause_campaign",
  "get_campaign_performance",
]) {
  assert(campaignTools.includes(`\"${tool}\"`), `Missing MCP tool: ${tool}`);
}

console.log("Campaign policy and tenant-isolation assertions passed");
