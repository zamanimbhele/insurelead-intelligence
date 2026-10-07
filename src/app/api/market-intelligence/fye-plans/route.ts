import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCampaignPlanning, getDashboardIdentity } from "@/lib/auth";
import { createDashboardFyeCampaignPlan } from "@/lib/dashboard-data";
import { MONTH_NAMES } from "@/lib/aggregation-utils";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  fyeMonth: z.enum(MONTH_NAMES as [string, ...string[]]),
  plannedContactMonth: z.enum(MONTH_NAMES as [string, ...string[]]),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A title, FYE month, and planned contact month are required" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCampaignPlanning(identity)) {
    return NextResponse.json(
      { error: "Only a platform administrator, broker manager, or marketing analyst may create a campaign plan" },
      { status: 403 },
    );
  }

  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await createDashboardFyeCampaignPlan(parsed.data, actor);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The campaign plan could not be created";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
