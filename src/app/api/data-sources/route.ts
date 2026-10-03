import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { createDashboardDataSource } from "@/lib/dashboard-data";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  sourceType: z.enum([
    "website_lead_form",
    "referral_partner",
    "approved_event_or_webinar",
    "approved_csv_upload",
    "crm_import",
    "email_campaign",
    "google_ads",
    "google_search_console",
    "organic_analytics",
    "approved_business_directory",
    "approved_commercial_data_provider",
    "public_aggregate_statistics",
    "manual_broker_entry",
  ]),
  owner: z.string().trim().min(1).max(200),
  legalBasis: z.string().trim().min(1).max(500),
  consentStatus: z.enum(["consent_obtained", "consent_pending", "not_required_aggregate", "not_applicable"]),
  approvedUse: z.string().trim().min(1).max(500),
  description: z.string().trim().max(2000).optional(),
  dataFieldsReceived: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  licenceReference: z.string().trim().max(200).optional(),
  retentionPeriodDays: z.number().int().min(1).max(3650).optional(),
  dataQualityRating: z.enum(["unrated", "low", "medium", "high"]).optional(),
  refreshFrequency: z.enum(["one_off", "daily", "weekly", "monthly", "quarterly", "continuous"]).optional(),
  containsPersonalInformation: z.boolean().optional(),
  allowedForMarketIntelligenceOnly: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid name, category, owner, legal basis, consent status, and approved use are required" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may register a data source" }, { status: 403 });
  }

  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await createDashboardDataSource(parsed.data, actor);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The data source could not be registered";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
