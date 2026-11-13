import { z } from "zod";
import { PRODUCT_ID_PATTERN, unavailableProductIds, type ProductCatalogue } from "../products.ts";

// A lead recorded by the practice's own staff (phone call, referral, walk-in),
// as opposed to one a member of the public submits on the website.
//
// The person adding it must say how the contact agreed to be contacted. That
// statement is the practice's own record; nothing here grants marketing or
// partner-sharing permission. The database function add_staff_lead() checks
// the same rules again.

export const CONTACT_BASIS_OPTIONS = [
  { value: "direct_enquiry", label: "They asked us to contact them (call, message or walk-in)" },
  { value: "referral", label: "Referred to us, and they agreed to be contacted" },
  { value: "existing_client", label: "Existing client asking about other cover" },
  { value: "meeting_or_event", label: "Met at a meeting or event and asked for follow-up" },
  { value: "other", label: "Other (describe below)" },
] as const;

const contactBasisValues = CONTACT_BASIS_OPTIONS.map((option) => option.value) as [
  (typeof CONTACT_BASIS_OPTIONS)[number]["value"],
  ...(typeof CONTACT_BASIS_OPTIONS)[number]["value"][],
];

export type ContactBasis = (typeof contactBasisValues)[number];

const trimmed = (max: number) => z.string().trim().max(max);

const staffLeadBase = z.strictObject({
  applicantType: z.enum(["individual", "business"], { error: "Choose whether this is a person or a business" }),
  businessName: trimmed(200).optional().default(""),
  industry: trimmed(120).optional().default(""),
  contactFullName: trimmed(200).min(2, "Full name is required"),
  contactRole: trimmed(120).optional().default(""),
  contactEmail: trimmed(254).optional().default("")
    .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email address"),
  contactMobile: trimmed(15).optional().default("")
    .refine((value) => !value || /^[0-9+() -]{10,15}$/.test(value), "Enter a valid mobile number"),
  preferredContactChannel: z.enum(["phone", "email", "whatsapp"], { error: "Choose how they prefer to be contacted" }),
  preferredContactTime: trimmed(120).optional().default(""),
  province: trimmed(60).min(1, "Select a province"),
  city: trimmed(120).min(1, "City or town is required"),
  suburb: trimmed(120).optional().default(""),
  insuranceProducts: z.array(z.string().regex(PRODUCT_ID_PATTERN, "Select a product from the list")).min(1, "Select at least one product").max(20),
  currentInsuranceStatus: z.enum(
    ["currently_insured", "not_currently_insured", "reviewing_existing_cover", "starting_new_business", "unsure"],
  ).optional().default("unsure"),
  mainConcern: trimmed(500).optional().default(""),
  contactBasis: z.enum(contactBasisValues, { error: "Say how this person agreed to be contacted" }),
  contactBasisNote: trimmed(500).optional().default(""),
  contactPermissionConfirmed: z.literal(true, { error: "Confirm that this person agreed to be contacted" }),
  allowDuplicate: z.boolean().optional().default(false),
});

export type StaffLeadInput = z.infer<typeof staffLeadBase>;

// `allowedProductIds`, when given, is the set the practice is authorised to
// sell; a product outside it is refused.
export function createStaffLeadSchema(catalogue: ProductCatalogue, allowedProductIds?: readonly string[]) {
  return staffLeadBase.superRefine((data, ctx) => {
    if (unavailableProductIds(data.insuranceProducts, catalogue, data.applicantType).length > 0) {
      ctx.addIssue({ code: "custom", path: ["insuranceProducts"], message: "One or more products do not match the applicant type" });
    } else if (allowedProductIds && data.insuranceProducts.some((product) => !allowedProductIds.includes(product))) {
      ctx.addIssue({ code: "custom", path: ["insuranceProducts"], message: "Your practice is not authorised for one or more of these products" });
    }
    if (data.applicantType === "business" && !data.businessName) {
      ctx.addIssue({ code: "custom", path: ["businessName"], message: "Business name is required for a business lead" });
    }
    if (!data.contactEmail && !data.contactMobile) {
      ctx.addIssue({ code: "custom", path: ["contactMobile"], message: "Give an email address or a mobile number" });
    }
    if (data.preferredContactChannel === "email" && !data.contactEmail) {
      ctx.addIssue({ code: "custom", path: ["contactEmail"], message: "An email address is needed to contact them by email" });
    }
    if (data.preferredContactChannel !== "email" && !data.contactMobile) {
      ctx.addIssue({ code: "custom", path: ["contactMobile"], message: "A mobile number is needed to contact them by phone or WhatsApp" });
    }
    if (data.contactBasis === "other" && !data.contactBasisNote) {
      ctx.addIssue({ code: "custom", path: ["contactBasisNote"], message: "Describe how this person agreed to be contacted" });
    }
  });
}

// 082 555 0100 and +27 82 555 0100 are the same number.
export function normaliseMobile(value: string | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return /^27\d{9}$/.test(digits) ? `0${digits.slice(2)}` : digits;
}
