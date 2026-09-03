// Core domain types for the InsureLead Intelligence prototype.
// In production these mirror the Supabase-generated database types.

export type InsuranceProduct =
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
  businessName: string;
  tradingName?: string;
  industry: string;
  businessType: string;
  employeeBand: string;
  turnoverBand: string;
  yearsInOperation: string;
  province: string;
  city: string;
  suburb?: string;
  postalCode?: string;
  website?: string;

  insuranceProducts: InsuranceProduct[];
  currentInsuranceStatus: CurrentInsuranceStatus;
  renewalMonth?: string;
  financialYearEndMonth?: string;
  mainConcern?: string;
  preferredContactTime?: string;
  preferredContactChannel: ContactChannel;

  contactFullName: string;
  contactRole: string;
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
export type LeadAllocationStatus = "reserved" | "accepted" | "disputed" | "released";

export interface Buyer {
  id: string;
  organisationName: string;
  buyerType: "broker" | "insurer";
  status: BuyerStatus;
  provinces: string[];
  industries: string[];
  minimumScore: number;
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
}

export interface AuditLogEntry {
  id: string;
  entity: "lead" | "consent" | "assignment" | "status";
  entityId: string;
  action: string;
  actor: string;
  timestamp: string;
  details?: string;
}
