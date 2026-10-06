// Local, file-based demo data store for the MVP prototype.
//
// PRODUCTION NOTE: This module exists only so the prototype is runnable
// without a hosted database. In production this is replaced entirely by
// Supabase (PostgreSQL + Row Level Security) as specified in the platform
// architecture - see README "Moving to Production".
import fs from "fs";
import path from "path";
import type {
  ApplicationSettings,
  AuditLogEntry,
  ConsentRecord,
  DataSource,
  DataSourceApprovalDecision,
  DataSourceApprovalRecord,
  DataSubjectRequest,
  DataSubjectRequestStatus,
  FinancialYearCampaignPlan,
  FyeCampaignPlanStatus,
  Lead,
  LeadActivity,
  LeadActivityKind,
  LeadInteractionChannel,
  LeadInteractionOutcome,
  LeadNote,
  LeadTask,
  LeadTaskStatus,
  OptOutRequest,
} from "./types.ts";
import { DEFAULT_HOTSPOT_MIN_LEAD_THRESHOLD, DEFAULT_LEAD_RETENTION_DAYS, INSURANCE_PRODUCTS } from "./constants.ts";
import { resolveDoNotContactForStatus } from "./lead-utils.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const CONSENTS_FILE = path.join(DATA_DIR, "consents.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit-log.json");
const APPLICATION_SETTINGS_FILE = path.join(DATA_DIR, "application-settings.json");
const LEAD_NOTES_FILE = path.join(DATA_DIR, "lead-notes.json");
const LEAD_TASKS_FILE = path.join(DATA_DIR, "lead-tasks.json");
const LEAD_ACTIVITIES_FILE = path.join(DATA_DIR, "lead-activities.json");
const OPT_OUT_REQUESTS_FILE = path.join(DATA_DIR, "opt-out-requests.json");
const DATA_SUBJECT_REQUESTS_FILE = path.join(DATA_DIR, "data-subject-requests.json");
const DATA_SOURCES_FILE = path.join(DATA_DIR, "data-sources.json");
const DATA_SOURCE_APPROVALS_FILE = path.join(DATA_DIR, "data-source-approvals.json");
const FYE_CAMPAIGN_PLANS_FILE = path.join(DATA_DIR, "fye-campaign-plans.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf-8");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getLeads(): Lead[] {
  return readJson<Lead[]>(LEADS_FILE, []).map(normaliseLead);
}

const PRODUCT_IDS = new Set(INSURANCE_PRODUCTS.map((product) => product.value));

function normaliseLead(lead: Lead): Lead {
  if (lead.applicantType) return lead;
  const storedProducts = lead.insuranceProducts as string[];
  const alreadyUsesCatalogue = storedProducts.some((product) => PRODUCT_IDS.has(product as Lead["insuranceProducts"][number]));
  return {
    ...lead,
    applicantType: "business",
    insuranceProducts: alreadyUsesCatalogue ? lead.insuranceProducts : ["business_insurance"],
    businessCoverInterests: lead.businessCoverInterests
      ?? (alreadyUsesCatalogue ? [] : storedProducts as Lead["businessCoverInterests"]),
  };
}

export function getLeadById(id: string): Lead | undefined {
  return getLeads().find((l) => l.id === id);
}

export function updateLead(id: string, changes: Partial<Lead>): Lead | undefined {
  const leads = getLeads();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) return undefined;

  const updated = { ...leads[index], ...changes, id: leads[index].id };
  leads[index] = updated;
  writeJson(LEADS_FILE, leads);
  return updated;
}

// Demo-mode equivalent of the Supabase update_lead_status() function: keeps
// the Kanban board's status move, the doNotContact flag, and (since the
// lead-activity-workflow feature) the loss reason and activity timeline
// consistent locally, the same way the database function does for
// Supabase mode. Throws rather than silently ignoring a missing loss
// reason, mirroring update_lead_status()'s own exception, so the API
// route's error handling path is identical in both data modes.
export function updateLeadStatus(
  id: string,
  nextStatus: Lead["status"],
  lossReason?: string,
  actorLabel = "dashboard_user",
): Lead | undefined {
  const lead = getLeadById(id);
  if (!lead) return undefined;
  if (nextStatus === "lost" && !lossReason?.trim()) {
    throw new Error("A loss reason is required when marking a lead as lost");
  }

  const doNotContact = resolveDoNotContactForStatus(lead.status, nextStatus, lead.doNotContact);
  const nextLossReason = nextStatus === "lost" ? lossReason?.trim() : undefined;
  const previousStatus = lead.status;
  const updated = updateLead(id, { status: nextStatus, doNotContact, lossReason: nextLossReason });

  appendLeadActivity({
    leadId: id,
    kind: nextStatus === "do_not_contact" ? "do_not_contact_set" : "status_change",
    summary: nextStatus === "lost"
      ? `Status changed to Lost: ${nextLossReason}`
      : `Status changed from ${previousStatus} to ${nextStatus}`,
    actorLabel,
    metadata: { from: previousStatus, to: nextStatus, lossReason: nextLossReason },
  });

  return updated;
}

export function saveLead(lead: Lead) {
  const leads = getLeads();
  leads.unshift(lead);
  writeJson(LEADS_FILE, leads);
}

export function findPossibleDuplicate(email: string, businessName?: string): Lead | undefined {
  const windowMs = 1000 * 60 * 60 * 24; // 24 hours
  const now = Date.now();
  return getLeads().find(
    (l) =>
      l.contactEmail.toLowerCase() === email.toLowerCase() &&
      (!businessName || l.businessName?.toLowerCase() === businessName.toLowerCase()) &&
      now - new Date(l.createdAt).getTime() < windowMs
  );
}

export function saveConsent(record: ConsentRecord) {
  const consents = readJson<ConsentRecord[]>(CONSENTS_FILE, []);
  consents.unshift(record);
  writeJson(CONSENTS_FILE, consents);
}

export function getConsentByLeadId(leadId: string): ConsentRecord | undefined {
  return readJson<ConsentRecord[]>(CONSENTS_FILE, []).find((record) => record.leadId === leadId);
}

export function getConsents(): ConsentRecord[] {
  return readJson<ConsentRecord[]>(CONSENTS_FILE, []);
}

export function appendAuditLog(entry: Omit<AuditLogEntry, "id" | "timestamp">) {
  const log = readJson<AuditLogEntry[]>(AUDIT_FILE, []);
  const fullEntry: AuditLogEntry = {
    ...entry,
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  log.unshift(fullEntry);
  writeJson(AUDIT_FILE, log);
  return fullEntry;
}

export function getAuditLog(): AuditLogEntry[] {
  return readJson<AuditLogEntry[]>(AUDIT_FILE, []);
}

// Demo-mode equivalent of the Supabase application_settings singleton row:
// a handful of platform-wide, compliance-admin-configurable values. Starts
// with just the lead-retention threshold; more legal/compliance text
// fields belong here too once BACKLOG.md's "Configurable legal-text
// fields" item is built.
export function getApplicationSettings(): ApplicationSettings {
  // Merged with defaults (rather than only falling back when the file is
  // entirely missing) so an existing settings file saved before a new
  // field existed - such as hotspotMinLeadThreshold - still gets that
  // field's default instead of undefined.
  const defaults: ApplicationSettings = {
    leadRetentionDays: DEFAULT_LEAD_RETENTION_DAYS,
    hotspotMinLeadThreshold: DEFAULT_HOTSPOT_MIN_LEAD_THRESHOLD,
  };
  return { ...defaults, ...readJson<Partial<ApplicationSettings>>(APPLICATION_SETTINGS_FILE, {}) };
}

export function updateApplicationSettings(changes: Partial<ApplicationSettings>): ApplicationSettings {
  const updated: ApplicationSettings = { ...getApplicationSettings(), ...changes, updatedAt: new Date().toISOString() };
  writeJson(APPLICATION_SETTINGS_FILE, updated);
  return updated;
}

// --- Broker workflow: notes, call/email/meeting logging, follow-up tasks,
// and the unified activity timeline. Demo-mode equivalent of the
// add_lead_note() / log_lead_interaction() / create_lead_task() /
// complete_lead_task() RPCs and the lead_activities table - see
// supabase/migrations/202610030002_lead_activity_workflow.sql.

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getLeadActivities(leadId: string): LeadActivity[] {
  return readJson<LeadActivity[]>(LEAD_ACTIVITIES_FILE, []).filter((activity) => activity.leadId === leadId);
}

export function appendLeadActivity(entry: Omit<LeadActivity, "id" | "occurredAt"> & { occurredAt?: string }): LeadActivity {
  const activities = readJson<LeadActivity[]>(LEAD_ACTIVITIES_FILE, []);
  const fullEntry: LeadActivity = {
    ...entry,
    id: generateId("activity"),
    occurredAt: entry.occurredAt ?? new Date().toISOString(),
  };
  activities.unshift(fullEntry);
  writeJson(LEAD_ACTIVITIES_FILE, activities);
  return fullEntry;
}

export function getLeadNotes(leadId: string): LeadNote[] {
  return readJson<LeadNote[]>(LEAD_NOTES_FILE, []).filter((note) => note.leadId === leadId);
}

export function addLeadNote(leadId: string, body: string, actorLabel: string): LeadNote | undefined {
  if (!getLeadById(leadId)) return undefined;
  if (!body.trim()) throw new Error("Note body must not be empty");

  const notes = readJson<LeadNote[]>(LEAD_NOTES_FILE, []);
  const note: LeadNote = {
    id: generateId("note"),
    leadId,
    authorLabel: actorLabel,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  notes.unshift(note);
  writeJson(LEAD_NOTES_FILE, notes);

  appendLeadActivity({ leadId, kind: "note_added", summary: "Note added", actorLabel, metadata: { noteId: note.id } });
  return note;
}

export function logLeadInteraction(
  leadId: string,
  input: { channel: LeadInteractionChannel; outcome: LeadInteractionOutcome; summary: string },
  actorLabel: string,
): LeadActivity | undefined {
  if (!getLeadById(leadId)) return undefined;
  if (!input.summary.trim()) throw new Error("Interaction summary must not be empty");

  return appendLeadActivity({
    leadId,
    kind: "interaction_logged",
    summary: input.summary.trim(),
    actorLabel,
    metadata: { channel: input.channel, outcome: input.outcome },
  });
}

export function getLeadTasks(leadId: string): LeadTask[] {
  return readJson<LeadTask[]>(LEAD_TASKS_FILE, []).filter((task) => task.leadId === leadId);
}

export function createLeadTask(
  leadId: string,
  input: { title: string; dueAt?: string; assigneeLabel?: string },
  actorLabel: string,
): LeadTask | undefined {
  if (!getLeadById(leadId)) return undefined;
  if (!input.title.trim()) throw new Error("Task title must not be empty");

  const tasks = readJson<LeadTask[]>(LEAD_TASKS_FILE, []);
  const task: LeadTask = {
    id: generateId("task"),
    leadId,
    title: input.title.trim(),
    dueAt: input.dueAt,
    assigneeLabel: input.assigneeLabel?.trim() || undefined,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  tasks.unshift(task);
  writeJson(LEAD_TASKS_FILE, tasks);

  appendLeadActivity({
    leadId,
    kind: "task_created",
    summary: `Follow-up task created: ${task.title}`,
    actorLabel,
    metadata: { taskId: task.id, dueAt: task.dueAt },
  });
  return task;
}

export function completeLeadTask(
  taskId: string,
  status: Extract<LeadTaskStatus, "completed" | "cancelled">,
  actorLabel: string,
): LeadTask | undefined {
  const tasks = readJson<LeadTask[]>(LEAD_TASKS_FILE, []);
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return undefined;

  const updated: LeadTask = { ...tasks[index], status, completedAt: new Date().toISOString() };
  tasks[index] = updated;
  writeJson(LEAD_TASKS_FILE, tasks);

  const kind: LeadActivityKind = status === "completed" ? "task_completed" : "task_cancelled";
  appendLeadActivity({
    leadId: updated.leadId,
    kind,
    summary: `${status === "completed" ? "Task completed" : "Task cancelled"}: ${updated.title}`,
    actorLabel,
    metadata: { taskId },
  });
  return updated;
}

// --- Compliance: opt-out requests and data subject access/correction/
// deletion requests (POPIA). Demo-mode equivalent of the
// create_opt_out_request() / process_opt_out_request() /
// create_data_subject_request() / update_data_subject_request_status()
// RPCs - see
// supabase/migrations/202610030003_opt_out_and_data_subject_requests.sql.
// Deliberately separate from the broker-campaign-scoped marketing
// suppression list in campaign-store.ts: this is the compliance team's
// own opt-out/DSR log, not an email-send suppression mechanism.

export function getOptOutRequests(): OptOutRequest[] {
  return readJson<OptOutRequest[]>(OPT_OUT_REQUESTS_FILE, []);
}

export function createOptOutRequest(
  input: {
    channel: OptOutRequest["channel"];
    source: OptOutRequest["source"];
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    reason?: string;
    leadId?: string;
  },
  actorLabel: string,
): OptOutRequest {
  if (!input.contactEmail?.trim() && !input.contactPhone?.trim() && !input.leadId) {
    throw new Error("Provide a contact email, contact phone, or lead to identify who is opting out");
  }
  if (input.leadId && !getLeadById(input.leadId)) throw new Error("Lead not found");

  const requests = getOptOutRequests();
  const request: OptOutRequest = {
    id: generateId("optout"),
    leadId: input.leadId,
    contactName: input.contactName?.trim() || undefined,
    contactEmail: input.contactEmail?.trim() || undefined,
    contactPhone: input.contactPhone?.trim() || undefined,
    channel: input.channel,
    reason: input.reason?.trim() || undefined,
    source: input.source,
    status: "new",
    requestedAt: new Date().toISOString(),
    createdBy: actorLabel,
  };
  requests.unshift(request);
  writeJson(OPT_OUT_REQUESTS_FILE, requests);

  appendAuditLog({
    entity: "opt_out",
    entityId: request.id,
    action: "opt_out_request_created",
    actor: actorLabel,
    details: `leadId=${request.leadId ?? "none"} channel=${request.channel} source=${request.source}`,
  });
  return request;
}

export function processOptOutRequest(
  requestId: string,
  resolutionNotes: string | undefined,
  actorLabel: string,
): OptOutRequest | undefined {
  const requests = getOptOutRequests();
  const index = requests.findIndex((request) => request.id === requestId);
  if (index === -1) return undefined;
  if (requests[index].status === "processed") {
    throw new Error("This opt-out request has already been processed");
  }

  const leadId = requests[index].leadId;
  if (leadId) updateLeadStatus(leadId, "do_not_contact", undefined, actorLabel);

  const updated: OptOutRequest = {
    ...requests[index],
    status: "processed",
    processedAt: new Date().toISOString(),
    processedBy: actorLabel,
    resolutionNotes: resolutionNotes?.trim() || undefined,
  };
  requests[index] = updated;
  writeJson(OPT_OUT_REQUESTS_FILE, requests);

  appendAuditLog({
    entity: "opt_out",
    entityId: requestId,
    action: "opt_out_request_processed",
    actor: actorLabel,
    details: `leadId=${leadId ?? "none"}`,
  });
  return updated;
}

export function getDataSubjectRequests(): DataSubjectRequest[] {
  return readJson<DataSubjectRequest[]>(DATA_SUBJECT_REQUESTS_FILE, []);
}

export function createDataSubjectRequest(
  input: {
    requestType: DataSubjectRequest["requestType"];
    requesterName: string;
    requesterEmail: string;
    requesterPhone?: string;
    details?: string;
    leadId?: string;
  },
  actorLabel: string,
): DataSubjectRequest {
  if (!input.requesterName.trim()) throw new Error("Requester name must not be empty");
  if (!input.requesterEmail.trim()) throw new Error("Requester email must not be empty");
  if (input.leadId && !getLeadById(input.leadId)) throw new Error("Lead not found");

  const requests = getDataSubjectRequests();
  const receivedAt = new Date();
  const dueAt = new Date(receivedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const request: DataSubjectRequest = {
    id: generateId("dsr"),
    leadId: input.leadId,
    requestType: input.requestType,
    requesterName: input.requesterName.trim(),
    requesterEmail: input.requesterEmail.trim(),
    requesterPhone: input.requesterPhone?.trim() || undefined,
    details: input.details?.trim() || undefined,
    status: "received",
    receivedAt: receivedAt.toISOString(),
    dueAt: dueAt.toISOString(),
    createdBy: actorLabel,
  };
  requests.unshift(request);
  writeJson(DATA_SUBJECT_REQUESTS_FILE, requests);

  appendAuditLog({
    entity: "data_subject_request",
    entityId: request.id,
    action: "data_subject_request_created",
    actor: actorLabel,
    details: `leadId=${request.leadId ?? "none"} requestType=${request.requestType} dueAt=${request.dueAt}`,
  });
  return request;
}

export function updateDataSubjectRequestStatus(
  requestId: string,
  status: Extract<DataSubjectRequestStatus, "verifying" | "in_progress" | "completed" | "rejected">,
  resolutionNotes: string | undefined,
  actorLabel: string,
): DataSubjectRequest | undefined {
  const requests = getDataSubjectRequests();
  const index = requests.findIndex((request) => request.id === requestId);
  if (index === -1) return undefined;
  const existing = requests[index];
  if (existing.status === "completed" || existing.status === "rejected") {
    throw new Error("This request has already been finalised");
  }

  let redacted = false;
  if (status === "completed" && existing.requestType === "deletion" && existing.leadId) {
    const lead = getLeadById(existing.leadId);
    if (lead) {
      updateLead(existing.leadId, {
        contactFullName: "[redacted - data subject deletion request]",
        contactEmail: `redacted-${existing.leadId}@deleted.invalid`,
        contactMobile: "",
        businessName: lead.businessName ? "[redacted]" : lead.businessName,
        tradingName: undefined,
        website: undefined,
        deletedAt: new Date().toISOString(),
        doNotContact: true,
      });
      redacted = true;

      appendLeadActivity({
        leadId: existing.leadId,
        kind: "pii_redacted",
        summary: "Personal data redacted following a data subject deletion request",
        actorLabel,
        metadata: { dataSubjectRequestId: existing.id },
      });
      appendAuditLog({
        entity: "lead",
        entityId: existing.leadId,
        action: "lead_pii_redacted",
        actor: actorLabel,
        details: `dataSubjectRequestId=${existing.id}`,
      });
    }
  }

  const updated: DataSubjectRequest = {
    ...existing,
    status,
    resolutionNotes: resolutionNotes?.trim() || existing.resolutionNotes,
    handledBy: actorLabel,
    completedAt: status === "completed" || status === "rejected" ? new Date().toISOString() : existing.completedAt,
  };
  requests[index] = updated;
  writeJson(DATA_SUBJECT_REQUESTS_FILE, requests);

  appendAuditLog({
    entity: "data_subject_request",
    entityId: requestId,
    action: "data_subject_request_status_changed",
    actor: actorLabel,
    details: `from=${existing.status} to=${status} redacted=${redacted}`,
  });
  return updated;
}

// --- Data Source Registry (project brief section 9). Demo-mode
// equivalent of create_data_source() / update_data_source() /
// decide_data_source_approval() - see
// supabase/migrations/202610040001_data_source_registry.sql. A source
// cannot be marked allowed-for-marketing until it is approved, mirroring
// the database's data_sources_marketing_requires_approval check.

export function getDataSources(): DataSource[] {
  return readJson<DataSource[]>(DATA_SOURCES_FILE, []);
}

export function getDataSourceApprovals(dataSourceId?: string): DataSourceApprovalRecord[] {
  const approvals = readJson<DataSourceApprovalRecord[]>(DATA_SOURCE_APPROVALS_FILE, []);
  return dataSourceId ? approvals.filter((approval) => approval.dataSourceId === dataSourceId) : approvals;
}

export function createDataSource(
  input: {
    name: string;
    sourceType: DataSource["sourceType"];
    owner: string;
    legalBasis: string;
    consentStatus: DataSource["consentStatus"];
    approvedUse: string;
    description?: string;
    dataFieldsReceived?: string[];
    licenceReference?: string;
    retentionPeriodDays?: number;
    dataQualityRating?: DataSource["dataQualityRating"];
    refreshFrequency?: DataSource["refreshFrequency"];
    containsPersonalInformation?: boolean;
    allowedForMarketIntelligenceOnly?: boolean;
  },
  actorLabel: string,
): DataSource {
  if (!input.name.trim()) throw new Error("Data source name must not be empty");
  if (!input.owner.trim()) throw new Error("Data source owner must not be empty");
  if (!input.legalBasis.trim()) throw new Error("Legal basis must not be empty");
  if (!input.approvedUse.trim()) throw new Error("Approved use must not be empty");

  const sources = getDataSources();
  const now = new Date().toISOString();
  const source: DataSource = {
    id: generateId("datasource"),
    name: input.name.trim(),
    sourceType: input.sourceType,
    owner: input.owner.trim(),
    description: input.description?.trim() || undefined,
    dataFieldsReceived: input.dataFieldsReceived ?? [],
    legalBasis: input.legalBasis.trim(),
    consentStatus: input.consentStatus,
    licenceReference: input.licenceReference?.trim() || undefined,
    retentionPeriodDays: input.retentionPeriodDays,
    approvedUse: input.approvedUse.trim(),
    approvalStatus: "pending",
    dataQualityRating: input.dataQualityRating ?? "unrated",
    refreshFrequency: input.refreshFrequency ?? "one_off",
    containsPersonalInformation: input.containsPersonalInformation ?? false,
    allowedForMarketing: false,
    allowedForMarketIntelligenceOnly: input.allowedForMarketIntelligenceOnly ?? false,
    createdBy: actorLabel,
    createdAt: now,
    updatedAt: now,
  };
  sources.unshift(source);
  writeJson(DATA_SOURCES_FILE, sources);

  appendAuditLog({
    entity: "data_source",
    entityId: source.id,
    action: "data_source_registered",
    actor: actorLabel,
    details: `name=${source.name} sourceType=${source.sourceType}`,
  });
  return source;
}

export function updateDataSource(
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
): DataSource | undefined {
  const sources = getDataSources();
  const index = sources.findIndex((source) => source.id === dataSourceId);
  if (index === -1) return undefined;

  const updated: DataSource = {
    ...sources[index],
    ...changes,
    name: changes.name?.trim() || sources[index].name,
    owner: changes.owner?.trim() || sources[index].owner,
    legalBasis: changes.legalBasis?.trim() || sources[index].legalBasis,
    approvedUse: changes.approvedUse?.trim() || sources[index].approvedUse,
    updatedAt: new Date().toISOString(),
  };
  sources[index] = updated;
  writeJson(DATA_SOURCES_FILE, sources);

  appendAuditLog({
    entity: "data_source",
    entityId: dataSourceId,
    action: "data_source_updated",
    actor: actorLabel,
  });
  return updated;
}

export function decideDataSourceApproval(
  dataSourceId: string,
  decision: DataSourceApprovalDecision,
  notes: string | undefined,
  allowedForMarketing: boolean | undefined,
  actorLabel: string,
): DataSource | undefined {
  const sources = getDataSources();
  const index = sources.findIndex((source) => source.id === dataSourceId);
  if (index === -1) return undefined;
  const previousStatus = sources[index].approvalStatus;

  const nextStatus: DataSource["approvalStatus"] =
    decision === "approved" || decision === "reinstated" ? "approved" : decision === "rejected" ? "rejected" : "suspended";
  const decidedAt = new Date().toISOString();

  const updated: DataSource = {
    ...sources[index],
    approvalStatus: nextStatus,
    lastReviewedAt: decidedAt,
    allowedForMarketing: nextStatus === "approved" && Boolean(allowedForMarketing),
    updatedAt: decidedAt,
  };
  sources[index] = updated;
  writeJson(DATA_SOURCES_FILE, sources);

  const approvals = getDataSourceApprovals();
  const approval: DataSourceApprovalRecord = {
    id: generateId("dsapproval"),
    dataSourceId,
    decision,
    notes: notes?.trim() || undefined,
    decidedBy: actorLabel,
    decidedAt,
  };
  approvals.unshift(approval);
  writeJson(DATA_SOURCE_APPROVALS_FILE, approvals);

  appendAuditLog({
    entity: "data_source",
    entityId: dataSourceId,
    action: "data_source_approval_decided",
    actor: actorLabel,
    details: `decision=${decision} from=${previousStatus} to=${nextStatus}`,
  });
  return updated;
}

// --- Financial-Year-End Campaign Planner (project brief section 8). See
// supabase/migrations/202610060001_fye_campaign_planner.sql for why this
// is a lightweight plan/reminder record, never an outbound send itself.

export function getFyeCampaignPlans(): FinancialYearCampaignPlan[] {
  return readJson<FinancialYearCampaignPlan[]>(FYE_CAMPAIGN_PLANS_FILE, []);
}

export function createFyeCampaignPlan(
  input: { title: string; fyeMonth: string; plannedContactMonth: string; notes?: string },
  actorLabel: string,
): FinancialYearCampaignPlan {
  if (!input.title.trim()) throw new Error("Plan title must not be empty");

  const plans = getFyeCampaignPlans();
  const now = new Date().toISOString();
  const plan: FinancialYearCampaignPlan = {
    id: generateId("fyeplan"),
    title: input.title.trim(),
    fyeMonth: input.fyeMonth,
    plannedContactMonth: input.plannedContactMonth,
    notes: input.notes?.trim() || undefined,
    status: "planned",
    createdBy: actorLabel,
    createdAt: now,
    updatedAt: now,
  };
  plans.unshift(plan);
  writeJson(FYE_CAMPAIGN_PLANS_FILE, plans);

  appendAuditLog({
    entity: "fye_campaign_plan",
    entityId: plan.id,
    action: "fye_campaign_plan_created",
    actor: actorLabel,
    details: `title=${plan.title} fyeMonth=${plan.fyeMonth}`,
  });
  return plan;
}

export function updateFyeCampaignPlanStatus(
  planId: string,
  status: FyeCampaignPlanStatus,
  actorLabel: string,
): FinancialYearCampaignPlan | undefined {
  const plans = getFyeCampaignPlans();
  const index = plans.findIndex((plan) => plan.id === planId);
  if (index === -1) return undefined;
  const previousStatus = plans[index].status;

  const updated: FinancialYearCampaignPlan = {
    ...plans[index],
    status,
    updatedAt: new Date().toISOString(),
  };
  plans[index] = updated;
  writeJson(FYE_CAMPAIGN_PLANS_FILE, plans);

  appendAuditLog({
    entity: "fye_campaign_plan",
    entityId: planId,
    action: "fye_campaign_plan_status_changed",
    actor: actorLabel,
    details: `from=${previousStatus} to=${status}`,
  });
  return updated;
}
