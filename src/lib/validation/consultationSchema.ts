import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";

const insuranceProductSchema = z.enum([
  "motor_insurance",
  "home_contents_insurance",
  "life_insurance",
  "funeral_cover",
  "travel_insurance",
  "personal_accident",
  "business_insurance",
  "general_insurance_review",
]);

const businessCoverSchema = z.enum([
  "commercial_motor",
  "public_liability",
  "property_and_contents",
  "contractors_all_risk",
  "professional_indemnity",
  "business_interruption",
  "cyber_insurance",
  "stock_equipment_machinery",
  "employee_related_cover",
  "general_review_or_comparison",
]);

export const applicantDetailsSchema = z.object({
  applicantType: z.enum(["individual", "business"], {
    error: "Please choose whether this enquiry is for you or a business",
  }),
  businessName: z.string().optional(),
  tradingName: z.string().optional(),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  employeeBand: z.string().optional(),
  turnoverBand: z.string().optional(),
  yearsInOperation: z.string().optional(),
  province: z.string().min(1, "Please select a province"),
  city: z.string().min(1, "City or town is required"),
  suburb: z.string().optional(),
  postalCode: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}$/.test(v), "Enter a valid 4-digit postal code"),
  website: z
    .string()
    .optional()
    .refine((v) => !v || /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i.test(v), "Enter a valid website address"),
});

export const insuranceNeedsSchema = z.object({
  insuranceProducts: z.array(insuranceProductSchema).min(1, "Select at least one insurance product"),
  businessCoverInterests: z.array(businessCoverSchema).optional().default([]),
  currentInsuranceStatus: z.string().min(1, "Please select your current insurance status"),
  renewalMonth: z.string().optional(),
  financialYearEndMonth: z.string().optional(),
  mainConcern: z.string().max(500).optional(),
  preferredContactTime: z.string().optional(),
  preferredContactChannel: z.enum(["phone", "email", "whatsapp"], {
    error: "Please select a preferred contact channel",
  }),
});

export const contactPersonSchema = z.object({
  contactFullName: z.string().min(2, "Full name is required"),
  contactRole: z.string().optional(),
  contactEmail: z.string().email("Enter a valid email address"),
  contactMobile: z
    .string()
    .min(10, "Enter a valid mobile number")
    .regex(/^[0-9+\s()-]{10,15}$/, "Enter a valid mobile number"),
  preferredContactMethod: z.enum(["phone", "email", "whatsapp"]),
});

export const consentSchema = z.object({
  privacyNoticeAccepted: z.literal(true, {
    error: "You must acknowledge the privacy notice",
  }),
  contactConsent: z.literal(true, {
    error: "Consent to be contacted is required to submit this enquiry",
  }),
  marketingConsent: z.boolean().optional().default(false),
  partnerSharingConsent: z.literal(true, {
    error: "Consent to share this enquiry with an approved insurance partner is required",
  }),
  maxPartnerRecipients: z.enum(["1", "3"]).default("1"),
  accuracyConfirmed: z.literal(true, {
    error: "Please confirm the information provided is accurate",
  }),
  nonBindingAcknowledged: z.literal(true, {
    error: "Please confirm you understand this is not a binding quote",
  }),
  captchaToken: z.string().max(2048).optional(),
  website_url: z.string().max(0).optional(),
});

export const consultationFormSchema = applicantDetailsSchema
  .merge(insuranceNeedsSchema)
  .merge(contactPersonSchema)
  .merge(consentSchema)
  .superRefine((data, ctx) => {
    const incompatibleProduct = data.insuranceProducts.find((product) => {
      if (product === "general_insurance_review") return false;
      return data.applicantType === "business"
        ? product !== "business_insurance"
        : product === "business_insurance";
    });
    if (incompatibleProduct) {
      ctx.addIssue({
        code: "custom",
        path: ["insuranceProducts"],
        message: "One or more selected products do not match the applicant type",
      });
    }
    if (data.applicantType === "individual" && data.businessCoverInterests.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["businessCoverInterests"],
        message: "Business cover areas can only be selected for a business enquiry",
      });
    }
    if (data.applicantType !== "business") return;
    const requiredBusinessFields: [keyof typeof data, string][] = [
      ["businessName", "Business name is required"],
      ["industry", "Please select an industry"],
      ["businessType", "Please select a business type"],
      ["employeeBand", "Please select a company size"],
      ["turnoverBand", "Please select an annual turnover range"],
      ["yearsInOperation", "Please select years in operation"],
      ["contactRole", "Role or job title is required for a business enquiry"],
    ];
    for (const [field, message] of requiredBusinessFields) {
      if (!String(data[field] ?? "").trim()) {
        ctx.addIssue({ code: "custom", path: [field], message });
      }
    }
  });

export type ConsultationFormInput = z.input<typeof consultationFormSchema>;
export type ConsultationFormValues = z.output<typeof consultationFormSchema>;
export type ConsultationFormHandle = UseFormReturn<
  ConsultationFormInput,
  unknown,
  ConsultationFormValues
>;
export type ApplicantDetailsValues = z.infer<typeof applicantDetailsSchema>;
export type InsuranceNeedsValues = z.infer<typeof insuranceNeedsSchema>;
export type ContactPersonValues = z.infer<typeof contactPersonSchema>;
export type ConsentValues = z.infer<typeof consentSchema>;
