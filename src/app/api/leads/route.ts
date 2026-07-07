import { NextRequest, NextResponse } from "next/server";
import { consultationFormSchema } from "@/lib/validation/consultationSchema";
import { saveLead, saveConsent, appendAuditLog, findPossibleDuplicate } from "@/lib/demo-store";
import { scoreLead } from "@/lib/scoring";
import { CONSENT_WORDING_VERSION } from "@/lib/constants";
import { Lead } from "@/lib/types";

// Very small in-memory rate limiter, keyed by IP, reset per server process.
// PRODUCTION NOTE: replace with a durable rate limiter (e.g. Upstash/Redis)
// in front of this route, plus CAPTCHA verification, before going live.
const submissionLog = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string) {
  const now = Date.now();
  const timestamps = (submissionLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  submissionLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

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
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many submissions. Please try again shortly." }, { status: 429 });
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

    const duplicate = findPossibleDuplicate(data.contactEmail, data.businessName);
    const isDuplicate = Boolean(duplicate);

    const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const scoring = scoreLead({
      hasCompleteContactInfo: Boolean(data.contactEmail && data.contactMobile && data.contactFullName),
      hasWebsite: Boolean(data.website),
      insuranceProductCount: data.insuranceProducts.length,
      renewalWithinDays: null,
      financialYearEndWithinDays: null,
      highPriorityIndustry: HIGH_PRIORITY_INDUSTRIES.has(data.industry),
      employeeBand: data.employeeBand,
      turnoverBand: data.turnoverBand,
      highIntentCampaignSource: HIGH_INTENT_CAMPAIGNS.has(body?.utm?.campaign ?? ""),
      isDirectReferral: (body?.utm?.source ?? "") === "referral",
      isDuplicate,
      doNotContact: false,
      hasInvalidContactDetails: false,
    });

    const lead: Lead = {
      id: leadId,
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
      createdAt: new Date().toISOString(),
    };

    saveLead(lead);

    saveConsent({
      leadId,
      privacyNoticeAccepted: data.privacyNoticeAccepted,
      contactConsent: data.contactConsent,
      marketingConsent: Boolean(data.marketingConsent),
      accuracyConfirmed: data.accuracyConfirmed,
      nonBindingAcknowledged: data.nonBindingAcknowledged,
      consentWordingVersion: CONSENT_WORDING_VERSION,
      sourceUrl: body?.sourceUrl ?? "",
      timestamp: new Date().toISOString(),
    });

    appendAuditLog({
      entity: "lead",
      entityId: leadId,
      action: "lead_created",
      actor: "public_form",
      details: `New lead captured via consultation form (${data.insuranceProducts.length} product(s) selected).`,
    });

    // PRODUCTION NOTE: trigger a secure internal notification (email/queue)
    // to the assigned broker or lead queue here.

    return NextResponse.json({ ok: true, leadId });
  } catch (err) {
    // Sanitised error - never leak stack traces or PII to the client.
    return NextResponse.json({ error: "Something went wrong submitting your enquiry." }, { status: 500 });
  }
}
