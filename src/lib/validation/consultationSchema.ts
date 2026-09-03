import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";

export const businessDetailsSchema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  tradingName: z.string().optional(),
  industry: z.string().min(1, "Please select an industry"),
  businessType: z.string().min(1, "Please select a business type"),
  employeeBand: z.string().min(1, "Please select a company size"),
  turnoverBand: z.string().min(1, "Please select an annual turnover range"),
  yearsInOperation: z.string().min(1, "Please select years in operation"),
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
  insuranceProducts: z.array(z.string()).min(1, "Select at least one insurance product"),
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
  contactRole: z.string().min(2, "Role or job title is required"),
  contactEmail: z.string().email("Enter a valid work email address"),
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
  website_url: z.string().max(0).optional(),
});

export const consultationFormSchema = businessDetailsSchema
  .merge(insuranceNeedsSchema)
  .merge(contactPersonSchema)
  .merge(consentSchema);

export type ConsultationFormInput = z.input<typeof consultationFormSchema>;
export type ConsultationFormValues = z.output<typeof consultationFormSchema>;
export type ConsultationFormHandle = UseFormReturn<
  ConsultationFormInput,
  unknown,
  ConsultationFormValues
>;
export type BusinessDetailsValues = z.infer<typeof businessDetailsSchema>;
export type InsuranceNeedsValues = z.infer<typeof insuranceNeedsSchema>;
export type ContactPersonValues = z.infer<typeof contactPersonSchema>;
export type ConsentValues = z.infer<typeof consentSchema>;
