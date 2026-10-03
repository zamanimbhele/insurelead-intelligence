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
  | "do_not_contact_set";

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
  // BACKLOG.md "Configurable legal-text fields" for the broader retention
  // *policy text* this number will eventually be configured alongside.
  leadRetentionDays: number;
  updatedAt?: string;
  updatedBy?: string;
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
  entity: "lead" | "consent" | "assignment" | "status" | "campaign" | "suppression" | "settings" | "note" | "task";
  entityId: string;
  action: string;
  actor: string;
  timestamp: string;
  details?: string;
}
