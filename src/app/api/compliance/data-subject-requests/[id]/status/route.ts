import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { updateDashboardDataSubjectRequestStatus } from "@/lib/dashboard-data";

const schema = z.object({
  status: z.enum(["verifying", "in_progress", "completed", "rejected"]),
  resolutionNotes: z.string().trim().max(1000).optional(),
});

const safeErrors = ["This request has already been finalised"];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The data subject request could not be updated";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid status is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may update a data subject request" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await updateDashboardDataSubjectRequestStatus(id, parsed.data.status, parsed.data.resolutionNotes, actor);
    if (!result) return NextResponse.json({ error: "Data subject request not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
