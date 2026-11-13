// Staff-added leads: a broker operator records a lead taken by phone,
// referral or in person. See supabase/migrations/202611130001_staff_added_leads.sql
// for who may do this and why the lead stays private to the practice.
//
// Supabase mode calls add_staff_lead() on the signed-in user's own session,
// so the database decides the organisation, re-checks the role and applies
// every rule again. Nothing here uses the service-role client.
import { BROKER_OPERATOR_ROLES, type DashboardIdentity } from "./auth.ts";
import { getDataMode } from "./supabase/config.ts";
import { createSupabaseServerClient } from "./supabase/server.ts";
import { addSupabaseStaffLead, fetchSupabaseAuthorisedProducts } from "./supabase/data.ts";
import { scoreLead } from "./scoring.ts";
import { activeProducts, type ProductCatalogue } from "./products.ts";
import type { Lead } from "./types.ts";
import { normaliseMobile, type StaffLeadInput } from "./validation/staffLeadSchema.ts";

export type StaffLeadResult = { status: "created" | "duplicate"; leadId: string };

// A UX gate. The database function is the authority.
export function canAddLeads(identity: DashboardIdentity) {
  return BROKER_OPERATOR_ROLES.includes(identity.role as (typeof BROKER_OPERATOR_ROLES)[number]);
}

// Products the form may offer: active in the catalogue and, in Supabase
// mode, ones the practice is authorised to sell.
export async function getStaffLeadProductOptions(identity: DashboardIdentity, catalogue: ProductCatalogue) {
  let authorised: string[] | undefined;
  if (getDataMode() !== "demo") {
    const client = await createSupabaseServerClient();
    if (!client || !identity.organisationId) return { individual: [], business: [], authorised: [] as string[] };
    authorised = await fetchSupabaseAuthorisedProducts(client, identity.organisationId);
  }
  const options = (applicantType: "individual" | "business") =>
    activeProducts(catalogue, applicantType)
      .filter((product) => !authorised || authorised.includes(product.value))
      .map((product) => ({ value: product.value, label: product.label }));
  return { individual: options("individual"), business: options("business"), authorised };
}

function score(input: StaffLeadInput) {
  return scoreLead({
    hasCompleteContactInfo: Boolean(input.contactEmail && input.contactMobile && input.contactFullName),
    hasWebsite: false,
    insuranceProductCount: input.insuranceProducts.length,
    renewalWithinDays: null,
    financialYearEndWithinDays: null,
    highPriorityIndustry: false,
    highIntentCampaignSource: false,
    isDirectReferral: input.contactBasis === "referral",
    isDuplicate: false,
    doNotContact: false,
    hasInvalidContactDetails: false,
  });
}

export async function addStaffLead(identity: DashboardIdentity, input: StaffLeadInput): Promise<StaffLeadResult> {
  const scoring = score(input);

  if (getDataMode() === "demo") {
    // Demo mode has no organisations, so a duplicate is any demo lead with
    // the same email or mobile number.
    const { getLeads, saveConsent, saveLead } = await import("./demo-store.ts");
    if (!input.allowDuplicate) {
      const mobile = normaliseMobile(input.contactMobile);
      const existing = getLeads().find((lead) => !lead.deletedAt && (
        (input.contactEmail && lead.contactEmail.toLowerCase() === input.contactEmail.toLowerCase())
        || (mobile && normaliseMobile(lead.contactMobile) === mobile)
      ));
      if (existing) return { status: "duplicate", leadId: existing.id };
    }
    const now = new Date().toISOString();
    const lead: Lead = {
      id: `lead_staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      applicantType: input.applicantType,
      businessName: input.businessName || undefined,
      industry: input.industry || undefined,
      province: input.province,
      city: input.city,
      suburb: input.suburb || undefined,
      insuranceProducts: input.insuranceProducts as Lead["insuranceProducts"],
      businessCoverInterests: [],
      currentInsuranceStatus: input.currentInsuranceStatus as Lead["currentInsuranceStatus"],
      mainConcern: input.mainConcern || undefined,
      preferredContactTime: input.preferredContactTime || undefined,
      preferredContactChannel: input.preferredContactChannel,
      contactFullName: input.contactFullName,
      contactRole: input.contactRole || undefined,
      contactEmail: input.contactEmail.toLowerCase(),
      contactMobile: input.contactMobile,
      status: "new",
      score: scoring.score,
      scoreBand: scoring.band,
      scoreExplanation: scoring.explanation,
      utm: { source: "staff" },
      doNotContact: false,
      origin: "staff_added",
      createdAt: now,
    };
    saveLead(lead);
    saveConsent({
      leadId: lead.id,
      privacyNoticeAccepted: false,
      contactConsent: true,
      marketingConsent: false,
      partnerSharingConsent: false,
      maxPartnerRecipients: 1,
      accuracyConfirmed: false,
      nonBindingAcknowledged: false,
      consentWordingVersion: "staff_recorded_v1",
      sourceUrl: "dashboard:new-lead",
      contactBasis: input.contactBasis,
      contactBasisNote: input.contactBasisNote || undefined,
      timestamp: now,
    });
    return { status: "created", leadId: lead.id };
  }

  const client = await createSupabaseServerClient();
  if (!client) throw new Error("Supabase is not configured for this environment");
  return addSupabaseStaffLead(client, {
    lead: {
      applicantType: input.applicantType,
      businessName: input.businessName,
      industry: input.industry,
      province: input.province,
      city: input.city,
      suburb: input.suburb,
      insuranceProducts: input.insuranceProducts,
      currentInsuranceStatus: input.currentInsuranceStatus,
      mainConcern: input.mainConcern,
      preferredContactTime: input.preferredContactTime,
      preferredContactChannel: input.preferredContactChannel,
      contactFullName: input.contactFullName,
      contactRole: input.contactRole,
      contactEmail: input.contactEmail,
      contactMobile: input.contactMobile,
      score: scoring.score,
      scoreBand: scoring.band,
      scoreExplanation: scoring.explanation,
    },
    consent: {
      contactBasis: input.contactBasis,
      contactBasisNote: input.contactBasisNote,
      contactPermissionConfirmed: input.contactPermissionConfirmed,
    },
    allowDuplicate: input.allowDuplicate,
  });
}
