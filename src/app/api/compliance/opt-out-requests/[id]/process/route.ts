import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { processDashboardOptOutRequest } from "@/lib/dashboard-data";

const schema = z.object({ resolutionNotes: z.string().trim().max(1000).optional() });

const safeErrors = ["This opt-out request has already been processed"];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The opt-out request could not be processed";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may process an opt-out request" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await processDashboardOptOutRequest(id, parsed.data.resolutionNotes, actor);
    if (!result) return NextResponse.json({ error: "Opt-out request not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
