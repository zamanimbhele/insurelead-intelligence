import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { updateDashboardDataSource } from "@/lib/dashboard-data";

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  owner: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  dataFieldsReceived: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  legalBasis: z.string().trim().min(1).max(500).optional(),
  consentStatus: z.enum(["consent_obtained", "consent_pending", "not_required_aggregate", "not_applicable"]).optional(),
  licenceReference: z.string().trim().max(200).optional(),
  retentionPeriodDays: z.number().int().min(1).max(3650).optional(),
  approvedUse: z.string().trim().min(1).max(500).optional(),
  dataQualityRating: z.enum(["unrated", "low", "medium", "high"]).optional(),
  refreshFrequency: z.enum(["one_off", "daily", "weekly", "monthly", "quarterly", "continuous"]).optional(),
  containsPersonalInformation: z.boolean().optional(),
  allowedForMarketIntelligenceOnly: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may update a data source" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await updateDashboardDataSource(id, parsed.data, actor);
    if (!result) return NextResponse.json({ error: "Data source not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The data source could not be updated";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
