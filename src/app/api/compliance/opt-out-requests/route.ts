import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { createDashboardOptOutRequest } from "@/lib/dashboard-data";

const schema = z.object({
  channel: z.enum(["email", "phone", "whatsapp", "all"]),
  source: z.enum(["phone_call", "email", "whatsapp", "written_letter", "dashboard_manual", "other"]),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(50).optional(),
  reason: z.string().trim().max(1000).optional(),
  leadId: z.string().trim().min(1).optional(),
});

const safeErrors = [
  "Provide a contact email, contact phone, or lead to identify who is opting out",
  "Lead not found",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The opt-out request could not be logged";
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid opt-out channel and source are required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may log an opt-out request" }, { status: 403 });
  }

  const actor = identity.displayName ?? identity.organisationName;
  const { contactEmail, ...rest } = parsed.data;

  try {
    const result = await createDashboardOptOutRequest(
      { ...rest, contactEmail: contactEmail || undefined },
      actor,
    );
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
