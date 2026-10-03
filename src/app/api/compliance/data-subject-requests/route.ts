import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { createDashboardDataSubjectRequest } from "@/lib/dashboard-data";

const schema = z.object({
  requestType: z.enum(["access", "correction", "deletion"]),
  requesterName: z.string().trim().min(1).max(200),
  requesterEmail: z.string().trim().email().max(200),
  requesterPhone: z.string().trim().max(50).optional(),
  details: z.string().trim().max(2000).optional(),
  leadId: z.string().trim().min(1).optional(),
});

const safeErrors = [
  "Requester name must not be empty",
  "Requester email must not be empty",
  "Lead not found",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The data subject request could not be logged";
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A request type, requester name, and requester email are required" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may log a data subject request" }, { status: 403 });
  }

  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await createDashboardDataSubjectRequest(parsed.data, actor);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
