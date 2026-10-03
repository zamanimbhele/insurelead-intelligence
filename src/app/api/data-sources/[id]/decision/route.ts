import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { decideDashboardDataSourceApproval } from "@/lib/dashboard-data";

const schema = z.object({
  decision: z.enum(["approved", "rejected", "suspended", "reinstated"]),
  notes: z.string().trim().max(1000).optional(),
  allowedForMarketing: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid decision is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may decide a data source approval" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await decideDashboardDataSourceApproval(id, parsed.data.decision, parsed.data.notes, parsed.data.allowedForMarketing, actor);
    if (!result) return NextResponse.json({ error: "Data source not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The approval decision could not be recorded";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
