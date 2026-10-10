import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSupabaseProfileMembership } from "@/lib/supabase/data";

const schema = z.object({
  role: z.enum([
    "platform_admin",
    "compliance_admin",
    "compliance_auditor",
    "broker_admin",
    "campaign_manager",
    "broker_agent",
  ]),
  memberStatus: z.enum(["invited", "active", "suspended"]),
});

const safeErrors = [
  "Role is not recognised",
  "Membership status is not recognised",
  "Only a platform administrator may change a member's role or status",
  "You cannot change your own role or membership status",
  "Profile not found",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The member could not be updated";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDataMode() === "demo") {
    return NextResponse.json({ error: "Member management requires Supabase mode" }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid role and membership status are required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !isPlatformAdmin(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const { id } = await params;
    const profile = await updateSupabaseProfileMembership(client, {
      profileId: id,
      role: parsed.data.role,
      memberStatus: parsed.data.memberStatus,
    });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
