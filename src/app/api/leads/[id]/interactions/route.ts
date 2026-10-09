import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logSupabaseLeadInteraction } from "@/lib/supabase/data";
import { logLeadInteraction } from "@/lib/demo-store";
import { LEAD_INTERACTION_CHANNELS, LEAD_INTERACTION_OUTCOMES } from "@/lib/constants";
import type { LeadInteractionChannel, LeadInteractionOutcome } from "@/lib/types";

const channels = LEAD_INTERACTION_CHANNELS.map((option) => option.value) as [LeadInteractionChannel, ...LeadInteractionChannel[]];
const outcomes = LEAD_INTERACTION_OUTCOMES.map((option) => option.value) as [LeadInteractionOutcome, ...LeadInteractionOutcome[]];

const schema = z.object({
  channel: z.enum(channels),
  outcome: z.enum(outcomes),
  summary: z.string().trim().min(1).max(2000),
});

const safeErrors = [
  "Interaction channel is not recognised",
  "Interaction outcome is not recognised",
  "Interaction summary must not be empty",
  "Only an active platform member may log an interaction",
  "Only a platform administrator or broker operator may log an interaction",
  "Lead is not allocated to your organisation",
  "Lead is marked do not contact",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The interaction could not be logged";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A channel, outcome, and summary are required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canUpdateLeadStatus(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  if (getDataMode() === "demo") {
    try {
      const activity = logLeadInteraction(id, parsed.data, actor);
      if (!activity) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      return NextResponse.json({ ok: true, activity });
    } catch (error) {
      return NextResponse.json({ error: safeError(error) }, { status: 409 });
    }
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const activityId = await logSupabaseLeadInteraction(client, { leadId: id, ...parsed.data });
    return NextResponse.json({ ok: true, id: activityId });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
