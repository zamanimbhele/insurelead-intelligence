// Core domain types for the InsureLead Intelligence prototype.
// In production these mirror the Supabase-generated database types.

export type ApplicantType = "individual" | "business";

export type InsuranceProduct =
  | "motor_insurance"
  | "home_contents_insurance"
  | "life_insurance"
  | "funeral_cover"
  | "travel_insurance"
  | "personal_accident"
  | "business_insurance"
  | "general_insurance_review";

export type BusinessCoverInterest =
  | "commercial_motor"
  | "public_liability"
  | "property_and_contents"
  | "contractors_all_risk"
  | "professional_indemnity"
  | "business_interruption"
  | "cyber_insurance"
  | "stock_equipment_machinery"
  | "employee_related_cover"
  | "general_review_or_comparison";

export type CurrentInsuranceStatus =
  | "currently_insured"
  | "not_currently_insured"
  | "reviewing_existing_cover"
  | "starting_new_business"
  | "unsure";

export type ContactChannel = "phone" | "email" | "whatsapp";

export type LeadStatus =
  | "new"
  | "contact_attempted"
  | "contacted"
  | "qualified"
  | "consultation_booked"
  | "quote_requested"
  | "quote_issued"
  | "negotiation"
  | "won"
  | "lost"
  | "nurture"
  | "do_not_contact"
  | "archived";

export type LeadScoreBand = "hot" | "warm" | "nurture" | "low_priority";

export interface Lead {
  id: string;
  applicantType: ApplicantType;
  businessName?: string;
  tradingName?: string;
  industry?: string;
  businessType?: string;
  employeeBand?: string;
  turnoverBand?: string;
  yearsInOperation?: string;
  province: string;
  city: string;
  suburb?: string;
  postalCode?: string;
  website?: string;

  insuranceProducts: InsuranceProduct[];
  businessCoverInterests?: BusinessCoverInterest[];
  currentInsuranceStatus: CurrentInsuranceStatus;
  renewalMonth?: string;
  financialYearEndMonth?: string;
  mainConcern?: string;
  preferredContactTime?: string;
  preferredContactChannel: ContactChannel;

  contactFullName: string;
  contactRole?: string;
  contactEmail: string;
  contactMobile: string;

  status: LeadStatus;
  score: number;
  scoreBand: LeadScoreBand;
  scoreExplanation: string;

  campaignSource?: string;
  utm: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  referrer?: string;

  doNotContact: boolean;
  assignedBroker?: string;
  lossReason?: string;
  // Set only once a data_subject_requests deletion request against this
  // lead has been completed - see update_data_subject_request_status().
  // The lead row itself is never hard-deleted (other tables still
  // reference it), but its personal-identifying fields are redacted.
  deletedAt?: string;

  createdAt: string;
}

export interface LeadNote {
  id: string;
  leadId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
}

export type LeadInteractionChannel = "call" | "email" | "meeting" | "whatsapp" | "other";

export type LeadInteractionOutcome =
  | "connected"
  | "left_message"
  | "no_answer"
  | "follow_up_required"
  | "not_interested"
  | "other";

export type LeadTaskStatus = "open" | "completed" | "cancelled";

export interface LeadTask {
  id: string;
  leadId: string;
  title: string;
  dueAt?: string;
  assigneeLabel?: string;
  status: LeadTaskStatus;
  createdAt: string;
  completedAt?: string;
}

// A single, chronological feed per lead. Status changes, notes, logged
// interactions, and task lifecycle events all land here so the lead
// profile page can render one timeline rather than stitching several
// tables together on every render.
export type LeadActivityKind =
  | "lead_created"
  | "status_change"
  | "note_added"
  | "interaction_logged"
  | "task_created"
  | "task_completed"
  | "task_cancelled"
  | "do_not_contact_set"
  | "pii_redacted";

export interface LeadActivity {
  id: string;
  leadId: string;
  kind: LeadActivityKind;
  summary: string;
  actorLabel: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface ApplicationSettings {
  // Leads older than this, still active, are surfaced on the compliance
  // dashboard as retention exceptions needing review or deletion. See
  // LegalTextDocument below ("data_retention_policy") for the retention
  // *policy text* this number is configured alongside.
  leadRetentionDays: number;
  // The geographic hotspot dashboard (src/lib/hotspot-scoring.ts) will not
  // display a province/municipality/suburb breakdown with fewer leads than
  // this, so a small, potentially identifiable area is never surfaced.
  hotspotMinLeadThreshold: number;
  updatedAt?: string;
  updatedBy?: string;
}

// Configurable legal-text fields (project brief section 2) - exactly 7
// fixed document keys, each editable by a platform or compliance admin
// with full version history (LegalTextDocumentVersion below). Read by the
// public site (Privacy Notice, Terms of Use, the consultation form's
// consent checkboxes) as well as the compliance dashboard - see
// src/lib/runtime-data.ts vs. src/lib/dashboard-data.ts for which data
// path each uses.
export type LegalTextDocumentKey =
  | "privacy_notice"
  | "consent_wording"
  | "contact_permission_wording"
  | "marketing_wording"
  | "fsp_disclosures"
  | "terms_of_use"
  | "data_retention_policy";

export interface LegalTextDocument {
  documentKey: LegalTextDocumentKey;
  title: string;
  content: string;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface LegalTextDocumentVersion {
  documentKey: LegalTextDocumentKey;
  version: number;
  content: string;
  updatedBy: string;
  createdAt: string;
}

export interface ConsentRecord {
  leadId: string;
  privacyNoticeAccepted: boolean;
  contactConsent: boolean;
  marketingConsent: boolean;
  partnerSharingConsent?: boolean;
  maxPartnerRecipients?: 1 | 3;
  accuracyConfirmed: boolean;
  nonBindingAcknowledged: boolean;
  consentWordingVersion: string;
  sourceUrl: string;
  timestamp: string;
}

export type BuyerStatus = "pending" | "active" | "suspended";
export type BrokerOnboardingStatus = "pending" | "in_review" | "approved" | "rejected";
export type LeadAllocationStatus = "reserved" | "accepted" | "disputed" | "released";
export type BrokerMemberStatus = "invited" | "active" | "suspended";
export type BrokerRole = "broker_admin" | "campaign_manager" | "broker_agent";
export type SendingIdentityStatus = "pending" | "verified" | "disabled";
export type CampaignStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "sending"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
export type CampaignObjective =
  | "awareness"
  | "renewal_reminder"
  | "cross_sell"
  | "quote_follow_up"
  | "seasonal";
export type CampaignRecipientStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed";

export interface CampaignAudienceRules {
  applicantTypes?: ApplicantType[];
  provinces?: string[];
  cities?: string[];
  industries?: string[];
  minimumScore?: number;
}

export interface Buyer {
  id: string;
  organisationName: string;
  slug?: string;
  buyerType: "broker" | "insurer";
  status: BuyerStatus;
  onboardingStatus: BrokerOnboardingStatus;
  fspNumber?: string;
  websiteUrl?: string;
  supportPhone?: string;
  provinces: string[];
  cities: string[];
  industries: string[];
  insuranceProducts: InsuranceProduct[];
  minimumScore: number;
  dailyLeadCapacity: number;
  contactSlaHours: number;
  acceptsSharedLeads: boolean;
  acceptsCampaigns: boolean;
  contactEmail: string;
}

export interface LeadAllocation {
  id: string;
  leadId: string;
  buyerId: string;
  status: LeadAllocationStatus;
  priceCents: number;
  exclusive: boolean;
  allocatedAt: string;
  acceptedAt?: string;
  respondedAt?: string;
}

export interface BrokerMember {
  id: string;
  organisationId: string;
  displayName?: string;
  jobTitle?: string;
  role: BrokerRole | "platform_admin" | "compliance_admin" | "compliance_auditor";
  status: BrokerMemberStatus;
  createdAt: string;
}

export interface BrokerSendingIdentity {
  id: string;
  organisationId: string;
  domain: string;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string;
  provider: "resend";
  status: SendingIdentityStatus;
  isDefault: boolean;
  createdAt: string;
}

export interface Campaign {
  id: string;
  organisationId: string;
  name: string;
  objective: CampaignObjective;
  insuranceProducts: InsuranceProduct[];
  audienceRules: CampaignAudienceRules;
  contactBasis: "marketing_consent";
  sendingIdentityId?: string;
  status: CampaignStatus;
  currentContentVersion?: number;
  approvedContentVersion?: number;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  scheduledAt?: string;
  launchedAt?: string;
  pausedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignContentVersion {
  id: string;
  campaignId: string;
  version: number;
  subject: string;
  preheader: string;
  htmlBody: string;
  textBody: string;
  generatedBy: string;
  createdAt: string;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  leadId: string;
  status: CampaignRecipientStatus;
  exclusionReason?: string;
  providerMessageId?: string;
  createdAt: string;
  sentAt?: string;
}

export type CampaignEventType =
  | "draft_created"
  | "content_generated"
  | "validation_completed"
  | "test_sent"
  | "approved"
  | "launch_started"
  | "recipient_sent"
  | "recipient_failed"
  | "paused"
  | "completed"
  | "recipient_unsubscribed";

export interface CampaignEvent {
  id: string;
  campaignId: string;
  recipientId?: string;
  eventType: CampaignEventType;
  actor: string;
  details: Record<string, unknown>;
  occurredAt: string;
}

export interface MarketingSuppression {
  id: string;
  organisationId: string;
  leadId?: string;
  emailHash: string;
  reason: "recipient_request" | "bounce" | "complaint" | "manual";
  createdAt: string;
}

export interface BuyerMatchDecision {
  buyerId: string;
  leadId: string;
  matched: boolean;
  reasons: string[];
}

export interface AuditLogEntry {
  id: string;
  entity:
    | "lead"
    | "consent"
    | "assignment"
    | "status"
    | "campaign"
    | "suppression"
    | "settings"
    | "note"
    | "task"
    | "opt_out"
    | "data_subject_request"
    | "data_source"
    | "fye_campaign_plan"
    | "export"
    | "legal_text"
    | "demo_data";
  entityId: string;
  action: string;
  actor: string;
  timestamp: string;
  details?: string;
}

// --- Opt-out requests and data subject access/correction/deletion
// requests (POPIA). Internal compliance-workflow records, created and
// resolved only by platform/compliance admins - distinct from the
// narrower, broker-campaign-scoped MarketingSuppression mechanism above.
// See supabase/migrations/202610030003_opt_out_and_data_subject_requests.sql.

export type OptOutChannel = "email" | "phone" | "whatsapp" | "all";

export type OptOutSource = "phone_call" | "email" | "whatsapp" | "written_letter" | "dashboard_manual" | "other";

export type OptOutRequestStatus = "new" | "processed";

export interface OptOutRequest {
  id: string;
  leadId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  channel: OptOutChannel;
  reason?: string;
  source: OptOutSource;
  status: OptOutRequestStatus;
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
  resolutionNotes?: string;
  createdBy: string;
}

export type DataSubjectRequestType = "access" | "correction" | "deletion";

export type DataSubjectRequestStatus = "received" | "verifying" | "in_progress" | "completed" | "rejected";

export interface DataSubjectRequest {
  id: string;
  leadId?: string;
  requestType: DataSubjectRequestType;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string;
  details?: string;
  status: DataSubjectRequestStatus;
  receivedAt: string;
  dueAt: string;
  completedAt?: string;
  handledBy?: string;
  resolutionNotes?: string;
  createdBy: string;
}

// --- Data Source Registry (project brief section 9: "Data Sources and
// Source Governance"). Every source of business or contact information
// the platform uses - for leads, campaigns, or market intelligence - is
// registered here with its legal basis, consent status, licence
// reference, retention period, and approved use before anything may
// import from it. Writes are restricted to platform/compliance admins -
// same lockdown pattern as the opt-out/data subject requests above. See
// supabase/migrations/202610040001_data_source_registry.sql.

export type DataSourceCategory =
  | "website_lead_form"
  | "referral_partner"
  | "approved_event_or_webinar"
  | "approved_csv_upload"
  | "crm_import"
  | "email_campaign"
  | "google_ads"
  | "google_search_console"
  | "organic_analytics"
  | "approved_business_directory"
  | "approved_commercial_data_provider"
  | "public_aggregate_statistics"
  | "manual_broker_entry";

export type DataSourceConsentStatus = "consent_obtained" | "consent_pending" | "not_required_aggregate" | "not_applicable";

export type DataSourceApprovalStatus = "pending" | "approved" | "rejected" | "suspended";

export type DataQualityRating = "unrated" | "low" | "medium" | "high";

export type DataSourceRefreshFrequency = "one_off" | "daily" | "weekly" | "monthly" | "quarterly" | "continuous";

export interface DataSource {
  id: string;
  name: string;
  sourceType: DataSourceCategory;
  owner: string;
  description?: string;
  dataFieldsReceived: string[];
  legalBasis: string;
  consentStatus: DataSourceConsentStatus;
  licenceReference?: string;
  retentionPeriodDays?: number;
  approvedUse: string;
  approvalStatus: DataSourceApprovalStatus;
  lastReviewedAt?: string;
  dataQualityRating: DataQualityRating;
  refreshFrequency: DataSourceRefreshFrequency;
  containsPersonalInformation: boolean;
  allowedForMarketing: boolean;
  allowedForMarketIntelligenceOnly: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// An append-only decision history against one data source - kept
// separate from DataSource.approvalStatus (its current state) so the
// full review trail survives every later re-decision.
export type DataSourceApprovalDecision = "approved" | "rejected" | "suspended" | "reinstated";

export interface DataSourceApprovalRecord {
  id: string;
  dataSourceId: string;
  decision: DataSourceApprovalDecision;
  notes?: string;
  decidedBy: string;
  decidedAt: string;
}

// Geographic hotspot dashboard (Market Intelligence). Computed live from
// leads at request time rather than from a stored snapshot table - see
// BACKLOG.md for the scoping note on why this is not yet backed by the
// project brief's `hotspot_snapshots` table.
export type HotspotLevel = "province" | "municipality" | "suburb";

export interface GeoHotspot {
  level: HotspotLevel;
  // e.g. "Gauteng", "Gauteng - Sandton", "Gauteng - Sandton - Bryanston".
  label: string;
  province: string;
  city?: string;
  suburb?: string;
  leadVolume: number;
  // Null when there is not enough prior-period history for this area to
  // measure a growth rate (never shown as a fabricated 0% or 100%).
  growthRate: number | null;
  // Null when the area has no won/lost leads yet to compute a rate from.
  conversionRate: number | null;
  topIndustry?: string;
  topInsuranceNeed?: string;
  topCampaignSource?: string;
  opportunityScore: number;
  opportunityExplanation: string;
  computedAt: string;
}

// Industry opportunity dashboard (Market Intelligence). Computed live,
// same as GeoHotspot - see src/lib/industries.ts.
export interface IndustryOpportunity {
  industry: string;
  leadVolume: number;
  growthRate: number | null;
  conversionRate: number | null;
  // How many leads in this industry gave a renewal month at all, vs. how
  // many of those fall within RENEWAL_URGENCY_WINDOW_DAYS of recurring.
  // renewalDataCount lets the UI tell "no renewal dates captured yet"
  // apart from "none of them are renewing soon".
  renewalDataCount: number;
  renewingSoonCount: number;
  topCoverNeed?: string;
  needsMarketingAttention: boolean;
  attentionReason?: string;
  opportunityScore: number;
  opportunityExplanation: string;
  computedAt: string;
}

// Financial-Year-End Campaign Planner (project brief section 8). A plan is
// a lightweight reminder/calendar entry - "reach out to businesses whose
// financial year-end is March, starting in January" - not a full outbound
// email campaign. That heavier system (audience rules, content versions,
// Resend delivery, tenant scoping) already exists for broker-run
// campaigns - see Campaign/CampaignContentVersion above and
// src/mcp/campaign-tools.ts - and is out of scope here; this planner only
// ever creates broker follow-up tasks (LeadTask, already-shipped) and
// plan/reminder records, never sends anything itself.
export type FyeCampaignPlanStatus = "planned" | "active" | "completed" | "cancelled";

export interface FinancialYearCampaignPlan {
  id: string;
  title: string;
  // The FYE month this plan targets (businesses whose financialYearEndMonth
  // matches) - distinct from plannedContactMonth, which is when brokers
  // should actually start reaching out (typically earlier in the year).
  fyeMonth: string;
  plannedContactMonth: string;
  notes?: string;
  status: FyeCampaignPlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
