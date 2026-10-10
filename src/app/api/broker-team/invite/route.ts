import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canInviteTeamMember, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachSupabaseInvitedProfile } from "@/lib/supabase/data";
import { inviteSupabaseAuthUser } from "@/lib/supabase/admin";

// Broker self-service team invitations - the fix for the gap flagged
// throughout BACKLOG.md/docs/BROKER_TENANCY_SETUP.md: a second team
// member joining an already-approved organisation previously had no path
// except another self-signup, which creates a duplicate pending
// organisation instead of joining the existing one. This route uses the
// Supabase Admin API (service-role key, server-only - see
// inviteSupabaseAuthUser()) to create the auth user and send Supabase's
// invite email, then attaches the resulting account to the inviter's own
// organisation via invite_broker_team_member().
const schema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["broker_admin", "campaign_manager", "broker_agent"]),
  displayName: z.string().trim().max(200).optional().or(z.literal("")),
});

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const known = [
    "Only a broker manager may invite a team member",
    "Role is not recognised",
    "Invited user not found",
    "This person already has a profile",
  ];
  const match = known.find((candidate) => message.includes(candidate));
  if (match) return match;
  if (message.toLowerCase().includes("already registered") || message.toLowerCase().includes("already been registered")) {
    return "A person with this email already has an account";
  }
  if (message.includes("Supabase mode requires")) return message;
  return "The invitation could not be sent";
}

export async function POST(request: NextRequest) {
  if (getDataMode() === "demo") {
    return NextResponse.json({ error: "Team invitations require Supabase mode" }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email and role are required" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canInviteTeamMember(identity)) {
    return NextResponse.json({ error: "Only a broker manager may invite a team member" }, { status: 403 });
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const userId = await inviteSupabaseAuthUser(parsed.data.email, parsed.data.displayName || undefined);
    const member = await attachSupabaseInvitedProfile(client, {
      userId,
      role: parsed.data.role,
      displayName: parsed.data.displayName || undefined,
    });
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
