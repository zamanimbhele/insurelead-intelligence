import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewSupabaseOrganisation } from "@/lib/supabase/data";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

const safeErrors = [
  "Decision must be approve or reject",
  "Only a platform administrator may review an organisation",
  "Organisation not found",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The organisation could not be reviewed";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDataMode() === "demo") {
    return NextResponse.json({ error: "Organisation approval requires Supabase mode" }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid decision is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !isPlatformAdmin(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const { id } = await params;
    const organisation = await reviewSupabaseOrganisation(client, {
      organisationId: id,
      decision: parsed.data.decision,
    });
    return NextResponse.json({ ok: true, organisation });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
