import {
  getApplicationSettings as getDemoApplicationSettings,
  getConsents as getDemoConsents,
  getDataSources as getDemoDataSources,
  getLeads,
} from "./demo-store";
import { getAllocations, getBuyers, getSendingIdentities } from "./marketplace-store";
import { createSupabaseServerClient } from "./supabase/server";
import { getDataMode } from "./supabase/config";
import {
  createSupabaseDataSource,
  createSupabaseDataSubjectRequest,
  createSupabaseOptOutRequest,
  decideSupabaseDataSourceApproval,
  fetchSupabaseAllocations,
  fetchSupabaseApplicationSettings,
  fetchSupabaseBrokerMembers,
  fetchSupabaseBuyers,
  fetchSupabaseConsents,
  fetchSupabaseDataSources,
  fetchSupabaseDataSubjectRequests,
  fetchSupabaseLead,
  fetchSupabaseLeadActivities,
  fetchSupabaseLeadNotes,
  fetchSupabaseLeadTasks,
  fetchSupabaseLeads,
  fetchSupabaseOptOutRequests,
  fetchSupabaseSendingIdentities,
  processSupabaseOptOutRequest,
  updateSupabaseApplicationSettings,
  updateSupabaseDataSource,
  updateSupabaseDataSubjectRequestStatus,
} from "./supabase/data";
import type { DashboardIdentity } from "./auth";
import type {
  ApplicationSettings,
  ConsentRecord,
  DataQualityRating,
  DataSource,
  DataSourceApprovalDecision,
  DataSourceCategory,
  DataSourceConsentStatus,
  DataSourceRefreshFrequency,
  DataSubjectRequest,
  DataSubjectRequestStatus,
  DataSubjectRequestType,
  Lead,
  LeadActivity,
  LeadNote,
  LeadTask,
  OptOutChannel,
  OptOutRequest,
  OptOutSource,
} from "./types";
import { getLeadDisplayName, isConsentValid } from "./lead-utils";
import { DEFAULT_LEAD_RETENTION_DAYS } from "./constants";
import { getCampaignRecipients, getCampaigns } from "./campaign-store";
import { fetchSupabaseCampaignRecipients, fetchSupabaseCampaigns } from "./supabase/campaign-data";

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
    return { buyers: getBuyers(), sendingIdentities: getSendingIdentities() };
  }
  const client = await requireServerClient();
  const [buyers, sendingIdentities] = await Promise.all([
    fetchSupabaseBuyers(client),
    fetchSupabaseSendingIdentities(client),
  ]);
  return { buyers, sendingIdentities };
}

export async function getDashboardBrokerWorkspace(identity: DashboardIdentity) {
  if (getDataMode() === "demo") {
    const buyer = getBuyers()[0];
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

export async function getApplicationSettings(): Promise<ApplicationSettings> {
  if (getDataMode() === "demo") return getDemoApplicationSettings();
  return fetchSupabaseApplicationSettings(await requireServerClient());
}

export async function updateApplicationSettings(
  changes: { leadRetentionDays: number },
  updatedBy?: string,
): Promise<ApplicationSettings> {
  if (getDataMode() === "demo") {
    const { updateApplicationSettings: updateDemoApplicationSettings } = await import("./demo-store");
    return updateDemoApplicationSettings(changes);
  }
  return updateSupabaseApplicationSettings(await requireServerClient(), { leadRetentionDays: changes.leadRetentionDays, updatedBy });
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
