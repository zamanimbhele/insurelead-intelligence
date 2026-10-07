import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCampaignPlanning, getDashboardIdentity } from "@/lib/auth";
import { updateDashboardFyeCampaignPlanStatus } from "@/lib/dashboard-data";

const schema = z.object({
  status: z.enum(["planned", "active", "completed", "cancelled"]),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid status is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCampaignPlanning(identity)) {
    return NextResponse.json(
      { error: "Only a platform administrator, broker manager, or marketing analyst may update a campaign plan" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await updateDashboardFyeCampaignPlanStatus(id, parsed.data.status, actor);
    if (!result) return NextResponse.json({ error: "Campaign plan not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The campaign plan status could not be updated";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
