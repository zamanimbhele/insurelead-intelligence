import {
  getApplicationSettings as getDemoApplicationSettings,
  getAuditLog as getDemoAuditLog,
  getConsents as getDemoConsents,
  getDataSources as getDemoDataSources,
  getFyeCampaignPlans as getDemoFyeCampaignPlans,
  getLeads,
  getLegalTextDocuments as getDemoLegalTextDocuments,
  getLegalTextDocumentVersions as getDemoLegalTextDocumentVersions,
} from "./demo-store";
import { createSendingIdentity, getAllocations, getBuyers, getSendingIdentities } from "./marketplace-store";
import { computeGeoHotspots } from "./hotspots";
import { computeIndustryOpportunities } from "./industries";
import { computeFyeCalendar, computeFyeMonthBreakdown, leadsForFyeFollowUp } from "./fye-planner";
import { MONTH_NAMES } from "./aggregation-utils";
import { filterAuditLog } from "./audit-log";
import type { AuditLogFilters } from "./audit-log";
import { createSupabaseServerClient } from "./supabase/server";
import { appendRuntimeCampaignEvent, getRuntimeCampaignQuota, updateRuntimeCampaign } from "./campaign-runtime";
import { getCampaignDeliveryMode } from "./campaign-delivery";
import { validateScheduleTime } from "./campaign-quota";
import { getDataMode } from "./supabase/config";
import {
  createSupabaseDataSource,
  createSupabaseDataSubjectRequest,
  createSupabaseFyeCampaignPlan,
  createSupabaseLeadTask,
  createSupabaseOptOutRequest,
  createSupabaseSendingIdentity,
  decideSupabaseDataSourceApproval,
  fetchSupabaseAllocations,
  fetchSupabaseApplicationSettings,
  fetchSupabaseBrokerMembers,
  fetchSupabaseBuyers,
  fetchSupabaseConsents,
  fetchSupabaseDataSources,
  fetchSupabaseDataSubjectRequests,
  fetchSupabaseAuditLog,
  fetchSupabaseFyeCampaignPlans,
  fetchSupabaseLead,
  fetchSupabaseLeadActivities,
  fetchSupabaseLeadNotes,
  fetchSupabaseLeadTasks,
  fetchSupabaseLeads,
  fetchSupabaseLegalTextDocuments,
  fetchSupabaseLegalTextDocumentVersions,
  fetchSupabaseOptOutRequests,
  fetchSupabaseSendingIdentities,
  processSupabaseOptOutRequest,
  updateSupabaseApplicationSettings,
  updateSupabaseDataSource,
  updateSupabaseDataSubjectRequestStatus,
  updateSupabaseFyeCampaignPlanStatus,
  updateSupabaseLegalTextDocument,
} from "./supabase/data";
import type { DashboardIdentity } from "./auth";
import type {
  ApplicationSettings,
  BrokerMember,
  ConsentRecord,
  DataQualityRating,
  DataSource,
  DataSourceApprovalDecision,
  DataSourceCategory,
  DataSourceConsentStatus,
  DataSourceRefreshFrequency,
  DataSubjectRequest,
  DataSubjectRequestStatus,
  AuditLogEntry,
  DataSubjectRequestType,
  FinancialYearCampaignPlan,
  FyeCampaignPlanStatus,
  Lead,
  LeadActivity,
  LeadNote,
  LeadTask,
  LegalTextDocument,
  LegalTextDocumentKey,
  LegalTextDocumentVersion,
  OptOutChannel,
  OptOutRequest,
  OptOutSource,
  Campaign,
  CampaignAudienceRules,
  InsuranceProduct,
} from "./types";
import { getLeadDisplayName, isConsentValid } from "./lead-utils";
import { DEFAULT_LEAD_RETENTION_DAYS } from "./constants";
import {
  getCampaignContentVersions,
  appendCampaignContent,
  appendCampaignEvent,
  createCampaign,
  getCampaignById,
  getCampaignEvents,
  getCampaignRecipients,
  getCampaigns,
  getCurrentCampaignContent,
  getMarketingSuppressions,
  updateCampaign,
} from "./campaign-store";
import {
  fetchSupabaseCampaignContentVersions,
  appendSupabaseCampaignEvent,
  createSupabaseCampaign,
  fetchSupabaseCampaign,
  fetchSupabaseCampaignContent,
  fetchSupabaseCampaignEvents,
  fetchSupabaseCampaignRecipients,
  fetchSupabaseCampaigns,
  fetchSupabaseMarketingSuppressions,
  saveSupabaseCampaignApproval,
  saveSupabaseCampaignContent,
} from "./supabase/campaign-data";
import {
  evaluateCampaignAudience,
  generateCampaignCopy,
  summariseAudience,
  validateCampaign,
} from "./campaign-policy";
import { getProductCatalogue } from "./product-catalogue.ts";
import { productLabelMap } from "./products.ts";
import { withRequiredDisclosure } from "./brand-runtime.ts";
import { brandedCopyInput } from "./brand.ts";

async function requireServerClient() {
  const client = await createSupabaseServerClient();
  if (!client) throw new Error("Supabase is not configured for this environment");
  return client;
}

export async function getDashboardLeads() {
  return getDataMode() === "demo" ? getLeads() : fetchSupabaseLeads(await requireServerClient());
}

export async function getDashboardLead(id: string) {
  if (getDataMode() === "demo") return getLeads().find((lead) => lead.id === id);
  return fetchSupabaseLead(await requireServerClient(), id);
}

export type LeadWorkspace = { notes: LeadNote[]; tasks: LeadTask[]; activities: LeadActivity[] };

// A lead always has a creation event even before any note, call, or task
// is ever logged against it, and that event isn't a stored row in either
// data mode - it's just the lead's own createdAt - so it's synthesised
// here, once, rather than duplicated into both demo-store.ts and the
// Supabase RPC migration.
function withCreationActivity(lead: Lead, activities: LeadActivity[]): LeadActivity[] {
  const creation: LeadActivity = {
    id: `lead_created_${lead.id}`,
    leadId: lead.id,
    kind: "lead_created",
    summary: "Lead created via public consultation form",
    actorLabel: "Public website",
    occurredAt: lead.createdAt,
  };
  return [...activities, creation].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

export async function getDashboardLeadWorkspace(lead: Lead): Promise<LeadWorkspace> {
  if (getDataMode() === "demo") {
    const { getLeadActivities, getLeadNotes, getLeadTasks } = await import("./demo-store");
    return {
      notes: getLeadNotes(lead.id),
      tasks: getLeadTasks(lead.id),
      activities: withCreationActivity(lead, getLeadActivities(lead.id)),
    };
  }

  const client = await requireServerClient();
  const [notes, tasks, activities] = await Promise.all([
    fetchSupabaseLeadNotes(client, lead.id),
    fetchSupabaseLeadTasks(client, lead.id),
    fetchSupabaseLeadActivities(client, lead.id),
  ]);
  return { notes, tasks, activities: withCreationActivity(lead, activities) };
}

export async function getDashboardMarketplaceData() {
  if (getDataMode() === "demo") {
    const leads = getLeads();
    const { getConsentByLeadId } = await import("./demo-store");
    return {
      leads,
      buyers: getBuyers(),
      allocations: getAllocations(),
      consents: new Map(leads.map((lead) => [lead.id, getConsentByLeadId(lead.id)])),
    };
  }

  const client = await requireServerClient();
  const leads = await fetchSupabaseLeads(client);
  const [buyers, allocations, consents] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseAllocations(client),
    fetchSupabaseConsents(client, leads.map((lead) => lead.id)),
  ]);
  return { leads, buyers, allocations, consents };
}

export async function getDashboardAllocationData() {
  if (getDataMode() === "demo") {
    return { leads: getLeads(), buyers: getBuyers(), allocations: getAllocations() };
  }
  const client = await requireServerClient();
  const [leads, buyers, allocations] = await Promise.all([
    fetchSupabaseLeads(client),
    fetchSupabaseBuyers(client),
    fetchSupabaseAllocations(client),
  ]);
  return { leads, buyers, allocations };
}

export async function getDashboardBrokerDirectory() {
  if (getDataMode() === "demo") {
    // Demo mode has no allocation/organisation-tenancy model at all (see
    // the Demo Accounts item in BACKLOG.md), so there is no per-member
    // roster to show here - only the Supabase-backed real tenancy model
    // has individual broker-staff profiles to review.
    return { buyers: getBuyers(), sendingIdentities: getSendingIdentities(), members: [] as BrokerMember[] };
  }
  const client = await requireServerClient();
  const [buyers, sendingIdentities] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseSendingIdentities(client),
  ]);
  const membersByOrg = await Promise.all(
    buyers.map((buyer) => fetchSupabaseBrokerMembers(client, buyer.id)),
  );
  return { buyers, sendingIdentities, members: membersByOrg.flat() };
}

// Demo mode: the demo account's own organisation (DEMO_ROLE_ACCOUNTS in
// constants.ts), else the first seeded broker as before.
function demoBuyerFor(identity: DashboardIdentity) {
  const buyers = getBuyers();
  return buyers.find((buyer) => buyer.id === identity.organisationId) ?? buyers[0];
}

export async function getDashboardBrokerWorkspace(identity: DashboardIdentity) {
  if (getDataMode() === "demo") {
    const buyer = demoBuyerFor(identity);
    return {
      buyer,
      members: [],
      sendingIdentities: buyer ? getSendingIdentities(buyer.id) : [],
    };
  }
  if (!identity.organisationId) return null;

  const client = await requireServerClient();
  const [buyers, members, sendingIdentities] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseBrokerMembers(client, identity.organisationId),
    fetchSupabaseSendingIdentities(client, identity.organisationId),
  ]);
  return {
    buyer: buyers.find((candidate) => candidate.id === identity.organisationId),
    members,
    sendingIdentities,
  };
}

export async function getDashboardCampaignData(identity: DashboardIdentity) {
  if (getDataMode() === "demo") {
    const campaigns = getCampaigns();
    return {
      campaigns,
      buyers: getBuyers(),
      recipients: new Map(campaigns.map((campaign) => [campaign.id, getCampaignRecipients(campaign.id)])),
    };
  }

  const client = await requireServerClient();
  const organisationId = identity.organisationType === "broker" || identity.organisationType === "insurer"
    ? identity.organisationId
    : undefined;
  const [campaigns, buyers] = await Promise.all([
    fetchSupabaseCampaigns(client, organisationId),
    fetchSupabaseBuyers(client),
  ]);
  const recipientEntries = await Promise.all(
    campaigns.map(async (campaign) => [campaign.id, await fetchSupabaseCampaignRecipients(client, campaign.id)] as const),
  );
  return { campaigns, buyers, recipients: new Map(recipientEntries) };
}

// Resolves which broker/insurer organisation a campaign-authoring action
// acts on. Demo mode has no per-session tenancy (see
// getDashboardBrokerWorkspace() above), so it always resolves to the
// same single seeded organisation the self-service sending-identity form
// already uses (getBuyers()[0] - "Gauteng Commercial Broker Pilot"),
// matching that established convention rather than inventing a second
// one. Supabase mode uses the caller's own profile organisation, which
// the campaigns RLS policies (can_manage_campaigns()/
// can_approve_campaigns() in 202609110002_campaign_generation_mcp.sql)
// independently re-verify server-side regardless of what this resolves
// to - this is a UX convenience, not the authority boundary.
function resolveCampaignOrganisationId(identity: DashboardIdentity): string | undefined {
  if (getDataMode() === "demo") return demoBuyerFor(identity)?.id;
  return identity.organisationType === "broker" || identity.organisationType === "insurer"
    ? identity.organisationId
    : undefined;
}

// What the "new campaign" and content-authoring forms need to render
// their own choices: the broker's approved product appetite (so the
// product checklist never offers a product the tenant isn't allowed to
// run a campaign for) and its sending identities. Deliberately returns
// every sending identity, not only "verified" ones - creating a draft
// with a pending identity is allowed by both the MCP's
// create_campaign_draft tool and the campaigns RLS insert policy (which
// only checks the identity belongs to the same organisation, not its
// status); only validateCampaign()'s "sender_unverified" issue, surfaced
// on the detail page, blocks that draft from being approved later.
export async function getDashboardCampaignAuthoringContext(identity: DashboardIdentity) {
  const organisationId = resolveCampaignOrganisationId(identity);
  if (!organisationId) return { organisationId: undefined, buyer: undefined, sendingIdentities: [] };
  if (getDataMode() === "demo") {
    return {
      organisationId,
      buyer: getBuyers().find((buyer) => buyer.id === organisationId),
      sendingIdentities: getSendingIdentities(organisationId),
    };
  }
  const client = await requireServerClient();
  const [buyers, sendingIdentities] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseSendingIdentities(client, organisationId),
  ]);
  return {
    organisationId,
    buyer: buyers.find((buyer) => buyer.id === organisationId),
    sendingIdentities,
  };
}

// Creates a new "draft" campaign brief - never content, never an
// approval, never a send. Mirrors the MCP server's create_campaign_draft
// tool (src/mcp/campaign-tools.ts) including its pre-checks (broker
// active+approved, campaigns permission enabled, products within the
// broker's approved appetite, sending identity owned by the same
// organisation) so a broker gets a clear, specific error message here
// instead of a raw RLS/constraint failure from the database. Those same
// rules are re-enforced independently by the campaigns table's own RLS
// insert policy in Supabase mode, so this pre-check is a UX improvement,
// not the authority boundary.
export async function createDashboardCampaignDraft(
  identity: DashboardIdentity,
  input: {
    name: string;
    objective: Campaign["objective"];
    insuranceProducts: InsuranceProduct[];
    sendingIdentityId: string;
    audienceRules: CampaignAudienceRules;
  },
) {
  const actorLabel = identity.displayName ?? identity.organisationName;
  const organisationId = resolveCampaignOrganisationId(identity);
  if (!organisationId) throw new Error("Your account has no organisation to create a campaign for");

  const context = await getDashboardCampaignAuthoringContext(identity);
  const buyer = context.buyer;
  if (!buyer || buyer.status !== "active" || buyer.onboardingStatus !== "approved") {
    throw new Error("Campaign broker must be active and approved");
  }
  if (!buyer.acceptsCampaigns) throw new Error("Campaign permission is disabled for this broker");
  const unapprovedProducts = input.insuranceProducts.filter((product) => !buyer.insuranceProducts.includes(product));
  if (unapprovedProducts.length) throw new Error("Campaign includes products outside the broker's approved appetite");
  if (buyer.authorisedProducts && input.insuranceProducts.some((product) => !buyer.authorisedProducts!.includes(product))) {
    throw new Error("Broker is not authorised for one or more of this campaign's products");
  }
  const sendingIdentity = context.sendingIdentities.find((candidate) => candidate.id === input.sendingIdentityId);
  if (!sendingIdentity) throw new Error("Sending identity belongs to another tenant or does not exist");

  const draft = {
    organisationId,
    name: input.name,
    objective: input.objective,
    insuranceProducts: input.insuranceProducts,
    audienceRules: input.audienceRules,
    contactBasis: "marketing_consent" as const,
    sendingIdentityId: input.sendingIdentityId,
    createdBy: actorLabel,
  };

  if (getDataMode() === "demo") {
    const campaign = createCampaign(draft);
    appendCampaignEvent({
      campaignId: campaign.id,
      eventType: "draft_created",
      actor: actorLabel,
      details: { organisationId, insuranceProducts: input.insuranceProducts },
    });
    return campaign;
  }
  const client = await requireServerClient();
  const campaign = await createSupabaseCampaign(client, draft);
  await appendSupabaseCampaignEvent(client, {
    campaignId: campaign.id,
    eventType: "draft_created",
    actor: actorLabel,
    details: { organisationId, insuranceProducts: input.insuranceProducts },
  });
  return campaign;
}

// Generates and stores a new immutable content version from a plain-
// language key message and call-to-action, mirroring the MCP server's
// generate_campaign_content tool. Content generation never approves or
// sends anything - saveSupabaseCampaignContent()'s underlying RPC
// (save_campaign_content_version) always resets any prior approval on
// the campaign, so a new version can never inherit an old sign-off.
export async function generateDashboardCampaignContent(
  identity: DashboardIdentity,
  campaignId: string,
  input: { keyMessage: string; callToActionLabel: string; callToActionUrl: string },
) {
  const actorLabel = identity.displayName ?? identity.organisationName;

  if (getDataMode() === "demo") {
    const campaign = getCampaignById(campaignId);
    if (!campaign) throw new Error("Campaign not found");
    if (["sending", "completed", "cancelled"].includes(campaign.status)) {
      throw new Error("Campaign content can no longer be changed");
    }
    const buyer = await withRequiredDisclosure(getBuyers().find((buyer) => buyer.id === campaign.organisationId));
    if (!buyer) throw new Error("Campaign broker not found");
    const generated = generateCampaignCopy(brandedCopyInput(buyer, { campaign, ...input, productLabels: productLabelMap(await getProductCatalogue()) }));
    const content = appendCampaignContent(campaignId, { ...generated, generatedBy: actorLabel });
    appendCampaignEvent({
      campaignId,
      eventType: "content_generated",
      actor: actorLabel,
      details: { contentVersion: content.version },
    });
    return content;
  }

  const client = await requireServerClient();
  const campaign = await fetchSupabaseCampaign(client, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (["sending", "completed", "cancelled"].includes(campaign.status)) {
    throw new Error("Campaign content can no longer be changed");
  }
  const buyers = await fetchSupabaseBuyers(client);
  const buyer = await withRequiredDisclosure(buyers.find((buyer) => buyer.id === campaign.organisationId));
  if (!buyer) throw new Error("Campaign broker not found");
  const generated = generateCampaignCopy(brandedCopyInput(buyer, { campaign, ...input, productLabels: productLabelMap(await getProductCatalogue()) }));
  const content = await saveSupabaseCampaignContent(client, campaignId, { ...generated, generatedBy: actorLabel });
  await appendSupabaseCampaignEvent(client, {
    campaignId,
    eventType: "content_generated",
    actor: actorLabel,
    details: { contentVersion: content.version },
  });
  return content;
}

// Records the final human sign-off on the current content version,
// mirroring the MCP server's approve_campaign tool: only a draft or
// pending-review campaign may be approved, and every validateCampaign()
// error (not just a missing content version) blocks it - the same
// "approve" button that calls this can never skip a policy failure the
// MCP agent would also have been stopped by. The attestation string is
// re-checked verbatim by the Supabase RPC (approve_campaign_content) as
// a z.literal equivalent on both sides of the dual-mode split.
export async function approveDashboardCampaign(
  identity: DashboardIdentity,
  campaignId: string,
  attestation: string,
) {
  const actorLabel = identity.displayName ?? identity.organisationName;
  const detail = await getDashboardCampaignDetail(identity, campaignId);
  if (!detail) throw new Error("Campaign not found");
  const { campaign, content } = detail;
  if (!["draft", "pending_review"].includes(campaign.status)) {
    throw new Error("Only a draft or pending-review campaign can be approved");
  }
  const errors = detail.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors[0].message);
  if (!content) throw new Error("Current content could not be loaded");

  if (getDataMode() === "demo") {
    const approved = updateCampaign(campaign.id, {
      status: "approved",
      approvedContentVersion: content.version,
      approvedBy: actorLabel,
      approvedAt: new Date().toISOString(),
    });
    appendCampaignEvent({
      campaignId: campaign.id,
      eventType: "approved",
      actor: actorLabel,
      details: { contentVersion: content.version, attestation },
    });
    return approved;
  }
  const client = await requireServerClient();
  const approved = await saveSupabaseCampaignApproval(client, {
    campaignId: campaign.id,
    contentVersionId: content.id,
    actor: actorLabel,
    attestation,
  });
  await appendSupabaseCampaignEvent(client, {
    campaignId: campaign.id,
    eventType: "approved",
    actor: actorLabel,
    details: { contentVersion: content.version, attestation },
  });
  return approved;
}

// Assembles everything the campaign detail page shows in one place: the
// campaign itself, its broker and sending identity, its current content
// version, a summarised audience evaluation, every validateCampaign()
// issue (the same checks create/content/approve above and the MCP tools
// all share), and its recipients/events for an audit trail. Returns
// undefined both when the campaign truly does not exist and when RLS
// hides it from this caller (a platform admin/compliance auditor or the
// owning tenant only - "campaign viewers use tenant scope" in
// 202609110002_campaign_generation_mcp.sql) - the two are
// indistinguishable from here by design, same as every other tenant-
// scoped detail lookup in this file.
export async function getDashboardCampaignDetail(identity: DashboardIdentity, campaignId: string) {
  if (getDataMode() === "demo") {
    const campaign = getCampaignById(campaignId);
    if (!campaign) return undefined;
    const buyer = await withRequiredDisclosure(getBuyers().find((candidate) => candidate.id === campaign.organisationId));
    const sendingIdentity = getSendingIdentities(campaign.organisationId)
      .find((candidate) => candidate.id === campaign.sendingIdentityId);
    const content = getCurrentCampaignContent(campaignId);
    const { leads, allocations, consents } = await getDashboardMarketplaceData();
    const suppressions = getMarketingSuppressions(campaign.organisationId);
    const audienceDecisions = evaluateCampaignAudience({ campaign, buyer, leads, consents, allocations, suppressions });
    const issues = validateCampaign({ campaign, buyer, sendingIdentity, content, audience: audienceDecisions });
    return {
      campaign,
      buyer,
      sendingIdentity,
      content,
      audience: summariseAudience(audienceDecisions),
      audienceDecisions,
      leads,
      issues,
      recipients: getCampaignRecipients(campaignId),
      events: getCampaignEvents(campaignId),
      quota: await getRuntimeCampaignQuota(campaign.organisationId),
    };
  }

  const client = await requireServerClient();
  const campaign = await fetchSupabaseCampaign(client, campaignId);
  if (!campaign) return undefined;
  const [buyers, sendingIdentities, content, marketplace, suppressions, recipients, events] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseSendingIdentities(client, campaign.organisationId),
    fetchSupabaseCampaignContent(client, campaignId, campaign.currentContentVersion),
    getDashboardMarketplaceData(),
    fetchSupabaseMarketingSuppressions(client, campaign.organisationId),
    fetchSupabaseCampaignRecipients(client, campaignId),
    fetchSupabaseCampaignEvents(client, campaignId),
  ]);
  const buyer = await withRequiredDisclosure(buyers.find((candidate) => candidate.id === campaign.organisationId));
  const sendingIdentity = sendingIdentities.find((candidate) => candidate.id === campaign.sendingIdentityId);
  const audienceDecisions = evaluateCampaignAudience({
    campaign,
    buyer,
    leads: marketplace.leads,
    consents: marketplace.consents,
    allocations: marketplace.allocations,
    suppressions,
  });
  const issues = validateCampaign({ campaign, buyer, sendingIdentity, content, audience: audienceDecisions });
  return {
    campaign,
    buyer,
    sendingIdentity,
    content,
    audience: summariseAudience(audienceDecisions),
    audienceDecisions,
    leads: marketplace.leads,
    issues,
    recipients,
    events,
    // Counted with the service-role client: the campaign itself was just
    // loaded through RLS above, so the caller is entitled to see its
    // tenant's send totals (counts only, no recipient data).
    quota: await getRuntimeCampaignQuota(campaign.organisationId),
  };
}

// --- Scheduled sending (dashboard) -------------------------------------
//
// Scheduling is a second, separate human decision after approval: it
// commits the approved content to actually being emailed. So it uses the
// approval role gate (canApproveCampaigns - broker_admin or platform
// admin), re-runs every validation check, and requires the exact
// confirmation phrase. The actual sending is done later by the scheduled
// sender (/api/cron/campaign-sends -> campaign-sender.ts), which re-checks
// everything again per recipient at send time.
export const SCHEDULE_CONFIRMATION = "I confirm this campaign may be emailed to its eligible audience";

export async function scheduleDashboardCampaign(
  identity: DashboardIdentity,
  campaignId: string,
  input: { sendAt: Date; confirmation: string },
) {
  const actorLabel = identity.displayName ?? identity.email ?? identity.organisationName;
  if (input.confirmation !== SCHEDULE_CONFIRMATION) throw new Error("The exact scheduling confirmation is required");
  const detail = await getDashboardCampaignDetail(identity, campaignId);
  if (!detail) throw new Error("Campaign not found");
  const { campaign } = detail;
  if (!["approved", "paused"].includes(campaign.status)) {
    throw new Error("Only an approved or paused campaign can be scheduled");
  }
  if (!campaign.currentContentVersion || campaign.approvedContentVersion !== campaign.currentContentVersion) {
    throw new Error("The current content version does not have approval");
  }
  const errors = detail.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors[0].message);
  if (getDataMode() !== "demo" && getCampaignDeliveryMode() !== "live") {
    throw new Error("Campaign delivery is not switched on for this environment");
  }
  const timeError = validateScheduleTime(input.sendAt, new Date());
  if (timeError) throw new Error(timeError);

  const resumed = campaign.status === "paused";
  // A paused campaign that already started resumes as "sending" (the
  // scheduler continues its queue); anything else waits for its time.
  const nextStatus = resumed && campaign.launchedAt && input.sendAt.getTime() <= Date.now() + 60_000
    ? "sending"
    : "scheduled";
  const updated = await updateRuntimeCampaign(campaign.id, {
    status: nextStatus,
    scheduledAt: input.sendAt.toISOString(),
  });
  await appendRuntimeCampaignEvent({
    campaignId: campaign.id,
    eventType: resumed ? "resumed" : "scheduled",
    actor: actorLabel,
    details: { scheduledAt: input.sendAt.toISOString(), eligibleRecipients: detail.audience.eligible },
  });
  return updated;
}

// Cancels a pending schedule (back to approved) or pauses one that is
// already sending. Queued recipients stay queued either way.
export async function stopDashboardCampaign(identity: DashboardIdentity, campaignId: string) {
  const actorLabel = identity.displayName ?? identity.email ?? identity.organisationName;
  const detail = await getDashboardCampaignDetail(identity, campaignId);
  if (!detail) throw new Error("Campaign not found");
  const { campaign } = detail;
  if (campaign.status === "scheduled") {
    const updated = await updateRuntimeCampaign(campaign.id, { status: "approved", scheduledAt: undefined });
    await appendRuntimeCampaignEvent({
      campaignId: campaign.id,
      eventType: "schedule_cancelled",
      actor: actorLabel,
      details: { previouslyScheduledAt: campaign.scheduledAt },
    });
    return updated;
  }
  if (campaign.status === "sending") {
    const updated = await updateRuntimeCampaign(campaign.id, { status: "paused", pausedAt: new Date().toISOString() });
    await appendRuntimeCampaignEvent({
      campaignId: campaign.id,
      eventType: "paused",
      actor: actorLabel,
      details: { reason: `Paused from the dashboard by ${actorLabel}` },
    });
    return updated;
  }
  throw new Error("Only a scheduled or sending campaign can be stopped");
}

// All content versions of one campaign, for the comparison page. Access is
// checked by loading the campaign first through the same tenant-scoped
// path as the detail page (RLS in Supabase mode).
export async function getDashboardCampaignVersions(campaignId: string) {
  if (getDataMode() === "demo") {
    const campaign = getCampaignById(campaignId);
    if (!campaign) return undefined;
    const versions = [...getCampaignContentVersions(campaignId)].sort((a, b) => a.version - b.version);
    return { campaign, versions };
  }
  const client = await requireServerClient();
  const campaign = await fetchSupabaseCampaign(client, campaignId);
  if (!campaign) return undefined;
  return { campaign, versions: await fetchSupabaseCampaignContentVersions(client, campaignId) };
}

export async function getApplicationSettings(): Promise<ApplicationSettings> {
  if (getDataMode() === "demo") return getDemoApplicationSettings();
  return fetchSupabaseApplicationSettings(await requireServerClient());
}

export async function updateApplicationSettings(
  changes: Partial<Pick<ApplicationSettings, "leadRetentionDays" | "hotspotMinLeadThreshold">>,
  updatedBy?: string,
): Promise<ApplicationSettings> {
  if (getDataMode() === "demo") {
    const { updateApplicationSettings: updateDemoApplicationSettings } = await import("./demo-store");
    return updateDemoApplicationSettings(changes);
  }
  return updateSupabaseApplicationSettings(await requireServerClient(), {
    leadRetentionDays: changes.leadRetentionDays,
    hotspotMinLeadThreshold: changes.hotspotMinLeadThreshold,
    updatedBy,
  });
}

// Geographic hotspot dashboard: one computation per level, gated by the
// admin-configurable application_settings.hotspot_min_lead_threshold - see
// src/lib/hotspots.ts for the aggregation and scoring itself.
export async function getGeoHotspots(level: "province" | "municipality" | "suburb") {
  const [leads, settings] = await Promise.all([getDashboardLeads(), getApplicationSettings()]);
  return computeGeoHotspots(leads, level, settings.hotspotMinLeadThreshold);
}

// Reuses the same application_settings.hotspot_min_lead_threshold as the
// geographic hotspot dashboard - one admin-configurable "minimum leads to
// show an aggregate breakdown" setting for both, rather than a second,
// industry-specific one.
export async function getIndustryOpportunities() {
  const [leads, settings] = await Promise.all([getDashboardLeads(), getApplicationSettings()]);
  return computeIndustryOpportunities(leads, settings.hotspotMinLeadThreshold);
}

// --- Financial-Year-End Campaign Planner (project brief section 8).

export async function getDashboardFyeCampaignPlans(): Promise<FinancialYearCampaignPlan[]> {
  if (getDataMode() === "demo") return getDemoFyeCampaignPlans();
  return fetchSupabaseFyeCampaignPlans(await requireServerClient());
}

export async function createDashboardFyeCampaignPlan(
  input: { title: string; fyeMonth: string; plannedContactMonth: string; notes?: string },
  actorLabel: string,
): Promise<{ id: string }> {
  if (getDataMode() === "demo") {
    const { createFyeCampaignPlan } = await import("./demo-store");
    return { id: createFyeCampaignPlan(input, actorLabel).id };
  }
  const id = await createSupabaseFyeCampaignPlan(await requireServerClient(), input);
  return { id };
}

// Broker self-service "add a sending identity" action
// (createCreateSendingIdentityForm / SendingIdentityForm.tsx on
// /dashboard/broker-profile). Demo mode has no organisation-tenancy
// model (see getDashboardBrokerWorkspace() above), so there is only ever
// one demo "organisation" to attach it to - the first seeded buyer, the
// same one the rest of the broker-profile page already shows. In
// Supabase mode the RPC itself resolves the caller's organisation
// server-side (create_broker_sending_identity() never trusts a
// client-supplied organisation id), so identity.organisationId is not
// even passed through here.
export async function createDashboardSendingIdentity(
  identity: DashboardIdentity,
  input: { domain: string; fromName: string; fromEmail: string; replyToEmail?: string },
) {
  const actorLabel = identity.displayName ?? identity.organisationName;
  if (getDataMode() === "demo") {
    const buyer = demoBuyerFor(identity);
    if (!buyer) throw new Error("No demo broker organisation is available");
    return createSendingIdentity({ organisationId: buyer.id, ...input }, actorLabel);
  }
  return createSupabaseSendingIdentity(await requireServerClient(), input);
}

export async function updateDashboardFyeCampaignPlanStatus(
  planId: string,
  status: FyeCampaignPlanStatus,
  actorLabel: string,
): Promise<{ id: string } | undefined> {
  if (getDataMode() === "demo") {
    const { updateFyeCampaignPlanStatus } = await import("./demo-store");
    const updated = updateFyeCampaignPlanStatus(planId, status, actorLabel);
    return updated ? { id: updated.id } : undefined;
  }
  const id = await updateSupabaseFyeCampaignPlanStatus(await requireServerClient(), { planId, status });
  return { id };
}

// One leads fetch powers the whole planner page: the 12-month calendar
// grid, and a per-month breakdown (sector/location/top need/conversion -
// brief section 8's "track campaign results by month, sector, location,
// and insurance need") for every month at once, rather than the page
// re-fetching all leads per month selected.
export async function getFyePlannerData() {
  const [leads, plans] = await Promise.all([getDashboardLeads(), getDashboardFyeCampaignPlans()]);
  return {
    calendar: computeFyeCalendar(leads, plans),
    plans,
    breakdowns: Object.fromEntries(MONTH_NAMES.map((month) => [month, computeFyeMonthBreakdown(leads, month)])),
  };
}

// Bulk-creates one LeadTask per eligible lead whose financialYearEndMonth
// is `month`, reusing the exact same per-lead creation path (and, in
// Supabase mode, the exact same create_lead_task RPC with its own
// org-allocation check) a single follow-up task already goes through - a
// bulk batch can never create a task somewhere a broker couldn't already
// create one by hand. Returns how many were created vs. skipped (the
// per-lead path rejected it - e.g. not allocated to this broker's
// organisation) rather than failing the whole batch over one lead.
export async function createDashboardFyeFollowUpTasks(
  month: string,
  taskTitle: string,
  actorLabel: string,
): Promise<{ created: number; skipped: number; totalEligible: number }> {
  const leads = await getDashboardLeads();
  const eligible = leadsForFyeFollowUp(leads, month);

  let created = 0;
  let skipped = 0;

  if (getDataMode() === "demo") {
    const { createLeadTask } = await import("./demo-store");
    for (const lead of eligible) {
      try {
        const task = createLeadTask(lead.id, { title: taskTitle, assigneeLabel: lead.assignedBroker }, actorLabel);
        if (task) created += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
  } else {
    const client = await requireServerClient();
    for (const lead of eligible) {
      try {
        await createSupabaseLeadTask(client, { leadId: lead.id, title: taskTitle, assigneeLabel: lead.assignedBroker });
        created += 1;
      } catch {
        skipped += 1;
      }
    }
  }

  return { created, skipped, totalEligible: eligible.length };
}

export type ComplianceLeadSummary = {
  id: string;
  displayName: string;
  status: Lead["status"];
  createdAt: string;
};

export type ComplianceOverview = {
  dataMode: "demo" | "supabase";
  totalLeads: number;
  retentionThresholdDays: number;
  consent: { validCount: number; invalidCount: number; coveragePct: number; invalidLeads: ComplianceLeadSummary[] };
  doNotContact: { count: number; leads: ComplianceLeadSummary[] };
  unassigned: { count: number; leads: ComplianceLeadSummary[] };
  retentionExceptions: { count: number; leads: ComplianceLeadSummary[] };
  optOuts: { newCount: number; requests: OptOutRequest[] };
  dataSubjectRequests: {
    openCount: number;
    overdueCount: number;
    // "overdue" is computed here, server-side, rather than in the client
    // component comparing dueAt against Date.now() on every render - React's
    // purity rule (react-hooks/purity) flags calling an impure function like
    // Date.now() during render.
    requests: (DataSubjectRequest & { overdue: boolean })[];
  };
  // Counts only - the full registry (list, create, approve/reject/
  // suspend) lives on its own /dashboard/data-sources page; this is what
  // the Compliance overview's "Data source approvals" widget needs.
  dataSourceRegistry: { pendingCount: number; approvedCount: number; rejectedCount: number; suspendedCount: number; totalCount: number };
  // Sourced from audit_logs entries this platform wrote for its own CSV
  // exports (entity "export") - see src/app/api/audit-log/export/route.ts.
  exportActivity: { count: number; lastExportAt?: string };
};

// A lead in one of these statuses no longer needs an active broker
// allocation to be compliant - it has already left the active pipeline -
// so it is excluded from the "unassigned" count rather than inflating it.
const ASSIGNMENT_NOT_REQUIRED_STATUSES: Lead["status"][] = ["won", "lost", "archived", "do_not_contact"];

// A lead currently routed to a broker organisation under any of these
// allocation statuses counts as assigned. "disputed" still counts: the
// allocation is contested, not withdrawn, so the lead has not fallen
// through the cracks.
const ACTIVE_ALLOCATION_STATUSES = new Set(["reserved", "accepted", "disputed"]);

const MAX_LISTED_LEADS = 10;
const MAX_LISTED_REQUESTS = 25;

// The set of lead IDs currently routed to a broker under an active
// allocation. This is the one authoritative definition of "assigned" -
// shared by the Compliance overview (below) and the main dashboard
// overview (src/app/(dashboard)/dashboard/page.tsx) - so neither page can
// drift back to the cosmetic, free-text Lead.assignedBroker field (seeded
// as a random name with no real allocation behind it) for this decision.
export async function getActiveAllocationLeadIds(): Promise<Set<string>> {
  if (getDataMode() === "demo") {
    return new Set(
      getAllocations()
        .filter((allocation) => ACTIVE_ALLOCATION_STATUSES.has(allocation.status))
        .map((allocation) => allocation.leadId),
    );
  }
  const allocations = await fetchSupabaseAllocations(await requireServerClient());
  return new Set(
    allocations.filter((allocation) => ACTIVE_ALLOCATION_STATUSES.has(allocation.status)).map((allocation) => allocation.leadId),
  );
}

// A lead is genuinely unassigned only if it both needs a broker and has no
// active allocation - see ASSIGNMENT_NOT_REQUIRED_STATUSES and
// ACTIVE_ALLOCATION_STATUSES above.
export function isLeadUnassigned(lead: Lead, assignedLeadIds: Set<string>): boolean {
  return !ASSIGNMENT_NOT_REQUIRED_STATUSES.includes(lead.status) && !assignedLeadIds.has(lead.id);
}

function toSummary(lead: Lead): ComplianceLeadSummary {
  return { id: lead.id, displayName: getLeadDisplayName(lead), status: lead.status, createdAt: lead.createdAt };
}

function isDataSubjectRequestOverdue(request: DataSubjectRequest): boolean {
  return (
    request.status !== "completed" &&
    request.status !== "rejected" &&
    new Date(request.dueAt).getTime() < Date.now()
  );
}

export async function getComplianceOverview(): Promise<ComplianceOverview> {
  const dataMode = getDataMode();
  const settings = await getApplicationSettings();

  let leads: Lead[];
  let consentByLeadId: Map<string, ConsentRecord | undefined>;

  if (dataMode === "demo") {
    leads = getLeads();
    const consents = getDemoConsents();
    const latestConsentByLead = new Map<string, (typeof consents)[number]>();
    // consents.json is append-only in demo mode (saveConsent unshifts), so
    // the first match per lead is the most recent one.
    for (const consent of consents) {
      if (!latestConsentByLead.has(consent.leadId)) latestConsentByLead.set(consent.leadId, consent);
    }
    consentByLeadId = latestConsentByLead;
  } else {
    const client = await requireServerClient();
    leads = await fetchSupabaseLeads(client);
    consentByLeadId = await fetchSupabaseConsents(client, leads.map((lead) => lead.id));
  }

  const assignedLeadIds = await getActiveAllocationLeadIds();
  // getDashboardAuditLog() already sorts most-recent-first, so [0] below is the last export.
  const exportLogEntries = await getDashboardAuditLog({ entity: "export" });
  const invalidConsentLeads = leads.filter((lead) => !isConsentValid(consentByLeadId.get(lead.id)));
  const doNotContactLeads = leads.filter((lead) => lead.doNotContact);
  const unassignedLeads = leads.filter((lead) => isLeadUnassigned(lead, assignedLeadIds));

  const retentionThresholdDays = settings.leadRetentionDays ?? DEFAULT_LEAD_RETENTION_DAYS;
  const retentionCutoff = Date.now() - retentionThresholdDays * 24 * 60 * 60 * 1000;
  const retentionExceptionLeads = leads.filter(
    (lead) => lead.status !== "archived" && new Date(lead.createdAt).getTime() < retentionCutoff,
  );

  const validCount = leads.length - invalidConsentLeads.length;

  const [optOutRequests, dataSubjectRequests, dataSources] = dataMode === "demo"
    ? await (async () => {
      const { getOptOutRequests, getDataSubjectRequests } = await import("./demo-store");
      return [getOptOutRequests(), getDataSubjectRequests(), getDemoDataSources()];
    })()
    : await (async () => {
      const client = await requireServerClient();
      return Promise.all([
        fetchSupabaseOptOutRequests(client),
        fetchSupabaseDataSubjectRequests(client),
        fetchSupabaseDataSources(client),
      ]);
    })();

  return {
    dataMode,
    totalLeads: leads.length,
    retentionThresholdDays,
    consent: {
      validCount,
      invalidCount: invalidConsentLeads.length,
      coveragePct: leads.length ? Math.round((validCount / leads.length) * 100) : 100,
      invalidLeads: invalidConsentLeads.slice(0, MAX_LISTED_LEADS).map(toSummary),
    },
    doNotContact: { count: doNotContactLeads.length, leads: doNotContactLeads.slice(0, MAX_LISTED_LEADS).map(toSummary) },
    unassigned: { count: unassignedLeads.length, leads: unassignedLeads.slice(0, MAX_LISTED_LEADS).map(toSummary) },
    retentionExceptions: {
      count: retentionExceptionLeads.length,
      leads: retentionExceptionLeads.slice(0, MAX_LISTED_LEADS).map(toSummary),
    },
    optOuts: {
      newCount: optOutRequests.filter((request) => request.status === "new").length,
      requests: optOutRequests.slice(0, MAX_LISTED_REQUESTS),
    },
    dataSubjectRequests: {
      openCount: dataSubjectRequests.filter((request) => request.status !== "completed" && request.status !== "rejected").length,
      overdueCount: dataSubjectRequests.filter(isDataSubjectRequestOverdue).length,
      requests: dataSubjectRequests
        .slice(0, MAX_LISTED_REQUESTS)
        .map((request) => ({ ...request, overdue: isDataSubjectRequestOverdue(request) })),
    },
    dataSourceRegistry: {
      pendingCount: dataSources.filter((source) => source.approvalStatus === "pending").length,
      approvedCount: dataSources.filter((source) => source.approvalStatus === "approved").length,
      rejectedCount: dataSources.filter((source) => source.approvalStatus === "rejected").length,
      suspendedCount: dataSources.filter((source) => source.approvalStatus === "suspended").length,
      totalCount: dataSources.length,
    },
    exportActivity: {
      count: exportLogEntries.length,
      lastExportAt: exportLogEntries[0]?.timestamp,
    },
  };
}

// --- Compliance: opt-out requests and data subject access/correction/
// deletion requests. Mirrors updateApplicationSettings()'s demo/supabase
// branching pattern above.

export async function createDashboardOptOutRequest(
  input: {
    channel: OptOutChannel;
    source: OptOutSource;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    reason?: string;
    leadId?: string;
  },
  actorLabel: string,
): Promise<{ id: string }> {
  if (getDataMode() === "demo") {
    const { createOptOutRequest } = await import("./demo-store");
    return { id: createOptOutRequest(input, actorLabel).id };
  }
  const id = await createSupabaseOptOutRequest(await requireServerClient(), input);
  return { id };
}

export async function processDashboardOptOutRequest(
  requestId: string,
  resolutionNotes: string | undefined,
  actorLabel: string,
): Promise<{ id: string } | undefined> {
  if (getDataMode() === "demo") {
    const { processOptOutRequest } = await import("./demo-store");
    const updated = processOptOutRequest(requestId, resolutionNotes, actorLabel);
    return updated ? { id: updated.id } : undefined;
  }
  const id = await processSupabaseOptOutRequest(await requireServerClient(), { requestId, resolutionNotes });
  return { id };
}

export async function createDashboardDataSubjectRequest(
  input: {
    requestType: DataSubjectRequestType;
    requesterName: string;
    requesterEmail: string;
    requesterPhone?: string;
    details?: string;
    leadId?: string;
  },
  actorLabel: string,
): Promise<{ id: string }> {
  if (getDataMode() === "demo") {
    const { createDataSubjectRequest } = await import("./demo-store");
    return { id: createDataSubjectRequest(input, actorLabel).id };
  }
  const id = await createSupabaseDataSubjectRequest(await requireServerClient(), input);
  return { id };
}

export async function updateDashboardDataSubjectRequestStatus(
  requestId: string,
  status: Extract<DataSubjectRequestStatus, "verifying" | "in_progress" | "completed" | "rejected">,
  resolutionNotes: string | undefined,
  actorLabel: string,
): Promise<{ id: string } | undefined> {
  if (getDataMode() === "demo") {
    const { updateDataSubjectRequestStatus } = await import("./demo-store");
    const updated = updateDataSubjectRequestStatus(requestId, status, resolutionNotes, actorLabel);
    return updated ? { id: updated.id } : undefined;
  }
  const id = await updateSupabaseDataSubjectRequestStatus(await requireServerClient(), { requestId, status, resolutionNotes });
  return { id };
}

// --- Data Source Registry (project brief section 9). Same demo/supabase
// branching pattern as the compliance functions above.

export async function getDashboardDataSources(): Promise<DataSource[]> {
  if (getDataMode() === "demo") return getDemoDataSources();
  return fetchSupabaseDataSources(await requireServerClient());
}

export async function createDashboardDataSource(
  input: {
    name: string;
    sourceType: DataSourceCategory;
    owner: string;
    legalBasis: string;
    consentStatus: DataSourceConsentStatus;
    approvedUse: string;
    description?: string;
    dataFieldsReceived?: string[];
    licenceReference?: string;
    retentionPeriodDays?: number;
    dataQualityRating?: DataQualityRating;
    refreshFrequency?: DataSourceRefreshFrequency;
    containsPersonalInformation?: boolean;
    allowedForMarketIntelligenceOnly?: boolean;
  },
  actorLabel: string,
): Promise<{ id: string }> {
  if (getDataMode() === "demo") {
    const { createDataSource } = await import("./demo-store");
    return { id: createDataSource(input, actorLabel).id };
  }
  const id = await createSupabaseDataSource(await requireServerClient(), input);
  return { id };
}

export async function updateDashboardDataSource(
  dataSourceId: string,
  changes: Partial<
    Pick<
      DataSource,
      | "name"
      | "owner"
      | "description"
      | "dataFieldsReceived"
      | "legalBasis"
      | "consentStatus"
      | "licenceReference"
      | "retentionPeriodDays"
      | "approvedUse"
      | "dataQualityRating"
      | "refreshFrequency"
      | "containsPersonalInformation"
      | "allowedForMarketIntelligenceOnly"
    >
  >,
  actorLabel: string,
): Promise<{ id: string } | undefined> {
  if (getDataMode() === "demo") {
    const { updateDataSource } = await import("./demo-store");
    const updated = updateDataSource(dataSourceId, changes, actorLabel);
    return updated ? { id: updated.id } : undefined;
  }
  const id = await updateSupabaseDataSource(await requireServerClient(), { dataSourceId, ...changes });
  return { id };
}

export async function decideDashboardDataSourceApproval(
  dataSourceId: string,
  decision: DataSourceApprovalDecision,
  notes: string | undefined,
  allowedForMarketing: boolean | undefined,
  actorLabel: string,
): Promise<{ id: string } | undefined> {
  if (getDataMode() === "demo") {
    const { decideDataSourceApproval } = await import("./demo-store");
    const updated = decideDataSourceApproval(dataSourceId, decision, notes, allowedForMarketing, actorLabel);
    return updated ? { id: updated.id } : undefined;
  }
  const id = await decideSupabaseDataSourceApproval(await requireServerClient(), { dataSourceId, decision, notes, allowedForMarketing });
  return { id };
}

// --- Audit Log Viewer (project brief Phase 5: "Audit log viewer"). No new
// RLS was needed for viewing - audit_logs already grants select to every
// authenticated role, with row-level policies (platform admins, compliance
// auditors, and a broker's own organisation-scoped entries) from
// 202609110001_multi_broker_tenancy.sql. This only adds a way to browse
// and filter what was already being written on every mutation across the
// app, plus a CSV export of that filtered view (see audit-log route).

// "Most recent N" rather than the whole table - this is a browsing/export
// tool for recent activity, not a data warehouse query, and an unbounded
// fetch would only get slower as the audit trail grows. The viewer and the
// export route both say so explicitly rather than implying completeness.
const MAX_AUDIT_LOG_ROWS = 500;

export async function getDashboardAuditLog(filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> {
  const entries =
    getDataMode() === "demo"
      ? getDemoAuditLog()
      : await fetchSupabaseAuditLog(await requireServerClient(), MAX_AUDIT_LOG_ROWS);
  return filterAuditLog(entries, filters).slice(0, MAX_AUDIT_LOG_ROWS);
}

// --- Configurable legal-text fields (project brief section 2). Viewing
// is open to anyone who can see the Compliance dashboard
// (canViewCompliance - platform admins and compliance auditors); editing
// is restricted to canManageCompliance (platform/compliance admins only)
// at the API route layer, matching the Data Source Registry's own split.
// The write path always goes through the update_legal_text_document() RPC
// in Supabase mode (never a direct table update), which re-validates the
// caller's role itself, bumps the version, and writes its own audit log
// entry - see supabase/migrations/202610080001_legal_text_documents.sql.

export async function getDashboardLegalTextDocuments(): Promise<LegalTextDocument[]> {
  if (getDataMode() === "demo") return getDemoLegalTextDocuments();
  return fetchSupabaseLegalTextDocuments(await requireServerClient());
}

export async function getDashboardLegalTextDocumentVersions(key: LegalTextDocumentKey): Promise<LegalTextDocumentVersion[]> {
  if (getDataMode() === "demo") return getDemoLegalTextDocumentVersions(key);
  return fetchSupabaseLegalTextDocumentVersions(await requireServerClient(), key);
}

export async function updateDashboardLegalTextDocument(
  key: LegalTextDocumentKey,
  content: string,
  actorLabel: string,
): Promise<LegalTextDocument> {
  if (getDataMode() === "demo") {
    const { updateLegalTextDocument } = await import("./demo-store");
    return updateLegalTextDocument(key, content, actorLabel);
  }
  return updateSupabaseLegalTextDocument(await requireServerClient(), { documentKey: key, content });
}
