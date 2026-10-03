import type {
  ApplicantType,
  BusinessCoverInterest,
  InsuranceProduct,
  LeadActivityKind,
  LeadInteractionChannel,
  LeadInteractionOutcome,
  LeadStatus,
} from "./types";

export const INSURANCE_PRODUCTS: {
  value: InsuranceProduct;
  label: string;
  description: string;
  applicantTypes: ApplicantType[];
}[] = [
  { value: "motor_insurance", label: "Motor Insurance", description: "Cover options for personal vehicles.", applicantTypes: ["individual"] },
  { value: "home_contents_insurance", label: "Home & Contents", description: "Protection for a home and its contents.", applicantTypes: ["individual"] },
  { value: "life_insurance", label: "Life Insurance", description: "Financial protection for the people who depend on you.", applicantTypes: ["individual"] },
  { value: "funeral_cover", label: "Funeral Cover", description: "Cover intended to help with funeral expenses.", applicantTypes: ["individual"] },
  { value: "travel_insurance", label: "Travel Insurance", description: "Cover options for domestic and international travel.", applicantTypes: ["individual"] },
  { value: "personal_accident", label: "Personal Accident", description: "Cover options following specified accidental injury events.", applicantTypes: ["individual"] },
  { value: "business_insurance", label: "Business Insurance", description: "Commercial cover options shaped around business risks.", applicantTypes: ["business"] },
  { value: "general_insurance_review", label: "Insurance Review", description: "A general review when you are unsure which product fits.", applicantTypes: ["individual", "business"] },
];

export const BUSINESS_COVER_OPTIONS: { value: BusinessCoverInterest; label: string }[] = [
  { value: "commercial_motor", label: "Commercial Motor Insurance" },
  { value: "public_liability", label: "Public Liability Insurance" },
  { value: "property_and_contents", label: "Property and Contents Insurance" },
  { value: "contractors_all_risk", label: "Contractors All-Risk Insurance" },
  { value: "professional_indemnity", label: "Professional Indemnity Insurance" },
  { value: "business_interruption", label: "Business Interruption Cover" },
  { value: "cyber_insurance", label: "Cyber Insurance" },
  { value: "stock_equipment_machinery", label: "Stock, Equipment and Machinery Cover" },
  { value: "employee_related_cover", label: "Employee-Related Business Insurance" },
  { value: "general_review_or_comparison", label: "General Insurance Review / Quote Comparison" },
];

export const INDUSTRIES = [
  "Retail and E-commerce",
  "Construction and Contracting",
  "Professional Services",
  "Manufacturing",
  "Hospitality and Tourism",
  "Transport and Logistics",
  "Healthcare and Wellness",
  "Agriculture",
  "Technology and IT Services",
  "Wholesale and Distribution",
  "Property and Real Estate",
  "Education and Training",
  "Other",
];

export const BUSINESS_TYPES = [
  "Sole Proprietor",
  "Partnership",
  "Private Company (Pty Ltd)",
  "Close Corporation",
  "Non-Profit Organisation",
  "Franchise",
  "Other",
];

export const EMPLOYEE_BANDS = ["1-5", "6-20", "21-50", "51-200", "200+"];

export const TURNOVER_BANDS = [
  "Under R1 million",
  "R1 million - R5 million",
  "R5 million - R20 million",
  "R20 million - R50 million",
  "R50 million+",
  "Prefer not to say",
];

export const YEARS_IN_OPERATION = ["Less than 1 year", "1-3 years", "4-10 years", "11-20 years", "20+ years"];

export const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

export const CURRENT_INSURANCE_STATUS = [
  { value: "currently_insured", label: "Currently insured" },
  { value: "not_currently_insured", label: "Not currently insured" },
  { value: "reviewing_existing_cover", label: "Reviewing existing cover" },
  { value: "starting_new_business", label: "Starting something new" },
  { value: "unsure", label: "Unsure" },
];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const CONSENT_WORDING_VERSION = "v3.0-2026-09-09-multi-product";

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  contact_attempted: "Contact Attempted",
  contacted: "Contacted",
  qualified: "Qualified",
  consultation_booked: "Consultation Booked",
  quote_requested: "Quote Requested",
  quote_issued: "Quote Issued",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
  do_not_contact: "Do Not Contact",
  archived: "Archived",
};

// Pipeline column order for the Kanban board and status filters. Mirrors the
// build specification's 13-stage lead lifecycle.
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new",
  "contact_attempted",
  "contacted",
  "qualified",
  "consultation_booked",
  "quote_requested",
  "quote_issued",
  "negotiation",
  "won",
  "lost",
  "nurture",
  "do_not_contact",
  "archived",
];

// The compliance dashboard's configurable "retention exception" threshold:
// default and allowed bounds for how many days a lead may age before it is
// flagged for review. Mirrors the check constraint on
// application_settings.lead_retention_days (see the compliance-dashboard
// migration) so client-side validation and the database agree.
export const DEFAULT_LEAD_RETENTION_DAYS = 730;
export const MIN_LEAD_RETENTION_DAYS = 30;
export const MAX_LEAD_RETENTION_DAYS = 3650;

// Broker workflow: call/email/meeting logging and the follow-up-task form
// on the lead profile page. Mirrors the check constraints on
// lead_activities.kind / the channel and outcome checks inside
// log_lead_interaction() (see the lead-activity-workflow migration) so
// client-side validation and the database agree.
export const LEAD_INTERACTION_CHANNELS: { value: LeadInteractionChannel; label: string }[] = [
  { value: "call", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Other" },
];

export const LEAD_INTERACTION_OUTCOMES: { value: LeadInteractionOutcome; label: string }[] = [
  { value: "connected", label: "Connected" },
  { value: "left_message", label: "Left a message" },
  { value: "no_answer", label: "No answer" },
  { value: "follow_up_required", label: "Follow-up required" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
];

export const LEAD_ACTIVITY_KIND_LABELS: Record<LeadActivityKind, string> = {
  lead_created: "Lead created",
  status_change: "Status changed",
  note_added: "Note added",
  interaction_logged: "Interaction logged",
  task_created: "Task created",
  task_completed: "Task completed",
  task_cancelled: "Task cancelled",
  do_not_contact_set: "Marked Do Not Contact",
};
