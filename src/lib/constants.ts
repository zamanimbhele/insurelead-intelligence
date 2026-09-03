export const INSURANCE_PRODUCTS: { value: string; label: string }[] = [
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
  { value: "starting_new_business", label: "Starting a new business" },
  { value: "unsure", label: "Unsure" },
];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const CONSENT_WORDING_VERSION = "v2.0-2026-09-03";

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
