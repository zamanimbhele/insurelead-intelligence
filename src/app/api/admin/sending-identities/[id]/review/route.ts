import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewSupabaseSendingIdentity } from "@/lib/supabase/data";

const schema = z.object({ status: z.enum(["verified", "disabled"]) });

const safeErrors = [
  "Status must be verified or disabled",
  "Only a platform administrator may review a sending identity",
  "Sending identity not found",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The sending identity could not be reviewed";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDataMode() === "demo") {
    return NextResponse.json({ error: "Sending-domain verification requires Supabase mode" }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid status is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !isPlatformAdmin(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const { id } = await params;
    const sendingIdentity = await reviewSupabaseSendingIdentity(client, {
      identityId: id,
      status: parsed.data.status,
    });
    return NextResponse.json({ ok: true, sendingIdentity });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
