import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canCreateSendingIdentity, getDashboardIdentity } from "@/lib/auth";
import { createDashboardSendingIdentity } from "@/lib/dashboard-data";

// Broker self-service sending identity creation - the counterpart to the
// platform-admin-only /api/admin/sending-identities/[id]/review route.
// Deliberately a separate, non-admin route: creating an identity for
// your own organisation and reviewing (verifying/disabling) someone
// else's are different authority levels, not the same action gated two
// ways.
const schema = z.object({
  domain: z.string().trim().min(1).max(255),
  fromName: z.string().trim().min(1).max(200),
  fromEmail: z.string().trim().email().max(320),
  replyToEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
});

const safeErrors = [
  "A sending domain is required",
  "A from-name is required",
  "A valid from-email address is required",
  "The reply-to address is not valid",
  "Only a broker manager or campaign manager may add a sending identity",
  "Your account has no organisation to attach a sending identity to",
  "A sending identity with this from-email already exists for your organisation",
  "No demo broker organisation is available",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The sending identity could not be added";
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A domain, from-name, and valid from-email are required" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canCreateSendingIdentity(identity)) {
    return NextResponse.json(
      { error: "Only a broker manager or campaign manager may add a sending identity" },
      { status: 403 },
    );
  }

  try {
    const sendingIdentity = await createDashboardSendingIdentity(identity, {
      domain: parsed.data.domain,
      fromName: parsed.data.fromName,
      fromEmail: parsed.data.fromEmail,
      replyToEmail: parsed.data.replyToEmail || undefined,
    });
    return NextResponse.json({ ok: true, sendingIdentity });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
