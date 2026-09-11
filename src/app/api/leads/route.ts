import { NextRequest, NextResponse } from "next/server";
import { consultationFormSchema } from "@/lib/validation/consultationSchema";
import { appendRuntimeAuditLog, captureRuntimeLead, hasRuntimeDuplicate } from "@/lib/runtime-data";
import { scoreLead } from "@/lib/scoring";
import { CONSENT_WORDING_VERSION } from "@/lib/constants";
import type { ConsentRecord, Lead } from "@/lib/types";
import { verifyLeadCaptcha } from "@/lib/security/captcha";
import { PublicSubmissionUnavailableError } from "@/lib/security/errors";
import { checkLeadSubmissionRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { notifyLeadCreated } from "@/lib/notifications";

const HIGH_PRIORITY_INDUSTRIES = new Set([
  "Construction and Contracting",
  "Manufacturing",
  "Transport and Logistics",
  "Professional Services",
  "Technology and IT Services",
]);
const HIGH_INTENT_CAMPAIGNS = new Set(["google-ads-fye-review", "webinar-cyber-risk", "referral-partner-network"]);

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkLeadSubmissionRateLimit(req.headers);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const body = await req.json();
    const parsed = consultationFormSchema.safeParse(body);

    if (!parsed.success) {
      // Sanitised validation error only - never echo raw request bodies into
      // logs or responses to avoid leaking PII.
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.data ? [] : parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Honeypot check - if the hidden field was filled, silently reject like a success.
    if (data.website_url && data.website_url.length > 0) {
      return NextResponse.json({ ok: true, leadId: null });
    }

    const captchaPassed = await verifyLeadCaptcha(data.captchaToken, getClientIp(req.headers));
    if (!captchaPassed) {
      return NextResponse.json(
        { error: "Security verification failed. Please try again." },
        { status: 400 },
      );
    }

    const isDuplicate = await hasRuntimeDuplicate(data.contactEmail, data.businessName);

    const scoring = scoreLead({
      hasCompleteContactInfo: Boolean(data.contactEmail && data.contactMobile && data.contactFullName),
      hasWebsite: Boolean(data.website),
      insuranceProductCount: data.insuranceProducts.length,
      renewalWithinDays: null,
      financialYearEndWithinDays: null,
      highPriorityIndustry: HIGH_PRIORITY_INDUSTRIES.has(data.industry ?? ""),
      employeeBand: data.employeeBand,
      turnoverBand: data.turnoverBand,
      highIntentCampaignSource: HIGH_INTENT_CAMPAIGNS.has(body?.utm?.campaign ?? ""),
      isDirectReferral: (body?.utm?.source ?? "") === "referral",
      isDuplicate,
      doNotContact: false,
      hasInvalidContactDetails: false,
    });

    const lead: Omit<Lead, "id" | "createdAt"> = {
      applicantType: data.applicantType,
      businessName: data.businessName,
      tradingName: data.tradingName,
      industry: data.industry,
      businessType: data.businessType,
      employeeBand: data.employeeBand,
      turnoverBand: data.turnoverBand,
      yearsInOperation: data.yearsInOperation,
      province: data.province,
      city: data.city,
      suburb: data.suburb,
      postalCode: data.postalCode,
      website: data.website,
      insuranceProducts: data.insuranceProducts as Lead["insuranceProducts"],
      businessCoverInterests: data.businessCoverInterests as Lead["businessCoverInterests"],
      currentInsuranceStatus: data.currentInsuranceStatus as Lead["currentInsuranceStatus"],
      renewalMonth: data.renewalMonth,
      financialYearEndMonth: data.financialYearEndMonth,
      mainConcern: data.mainConcern,
      preferredContactTime: data.preferredContactTime,
      preferredContactChannel: data.preferredContactChannel,
      contactFullName: data.contactFullName,
      contactRole: data.contactRole,
      contactEmail: data.contactEmail,
      contactMobile: data.contactMobile,
      status: "new",
      score: scoring.score,
      scoreBand: scoring.band,
      scoreExplanation: scoring.explanation,
      campaignSource: body?.utm?.campaign,
      utm: body?.utm ?? {},
      referrer: body?.referrer,
      doNotContact: false,
      assignedBroker: undefined,
    };

    const consent: Omit<ConsentRecord, "leadId" | "timestamp"> = {
      privacyNoticeAccepted: data.privacyNoticeAccepted,
      contactConsent: data.contactConsent,
      marketingConsent: Boolean(data.marketingConsent),
      partnerSharingConsent: data.partnerSharingConsent,
      maxPartnerRecipients: Number(data.maxPartnerRecipients) as 1 | 3,
      accuracyConfirmed: data.accuracyConfirmed,
      nonBindingAcknowledged: data.nonBindingAcknowledged,
      consentWordingVersion: CONSENT_WORDING_VERSION,
      sourceUrl: body?.sourceUrl ?? "",
    };

    const leadId = await captureRuntimeLead(lead, consent);
    const notification = await notifyLeadCreated(leadId, lead);
    if (notification !== "disabled") {
      try {
        await appendRuntimeAuditLog({
          entity: "lead",
          entityId: leadId,
          action: notification === "sent" ? "lead_notification_sent" : "lead_notification_failed",
          actor: "system",
          details: notification === "sent"
            ? "The configured lead-queue webhook accepted the notification."
            : "The configured lead-queue webhook did not accept the notification.",
        });
      } catch {
        // The lead is already safely captured. Notification audit failure must
        // not make the public form report a false submission failure.
      }
    }

    return NextResponse.json({ ok: true, leadId });
  } catch (err) {
    // Sanitised error - never leak stack traces or PII to the client.
    if (err instanceof PublicSubmissionUnavailableError
      || (err instanceof Error && err.message.includes("Supabase mode requires"))) {
      return NextResponse.json({ error: "Lead capture is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "Something went wrong submitting your enquiry." }, { status: 500 });
  }
}
