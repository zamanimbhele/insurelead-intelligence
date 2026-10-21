import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canApproveCampaigns, getDashboardIdentity } from "@/lib/auth";
import { parseSastLocalDateTime } from "@/lib/campaign-quota";
import { SCHEDULE_CONFIRMATION, scheduleDashboardCampaign, stopDashboardCampaign } from "@/lib/dashboard-data";

// POST schedules (or resumes) an approved campaign; DELETE cancels a
// pending schedule or pauses a campaign that is sending. Both are gated
// like approval: broker_admin or platform admin only.
const schema = z.object({
  // "now", or a <input type="datetime-local"> value interpreted as SAST.
  sendAt: z.union([z.literal("now"), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),
  confirmation: z.literal(SCHEDULE_CONFIRMATION),
});

const safeErrors = [
  "Campaign not found",
  "Only an approved or paused campaign can be scheduled",
  "The current content version does not have approval",
  "Campaign delivery is not switched on for this environment",
  "The send time must not be in the past",
  "The send time must be within",
  "Only a scheduled or sending campaign can be stopped",
];

function safeError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (safeErrors.some((candidate) => message.includes(candidate))) return message;
  // Validation issue messages from validateCampaign() are already
  // user-facing; anything else (database errors) is not echoed.
  return /^[A-Z][^\n]{0,200}\.$/.test(message) ? message : fallback;
}

async function authorise() {
  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return { response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  if (!identity.accessAllowed || !canApproveCampaigns(identity)) {
    return {
      response: NextResponse.json(
        { error: "Only a broker administrator or platform administrator may schedule or stop a campaign" },
        { status: 403 },
      ),
    };
  }
  return { identity };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `A send time and the exact confirmation "${SCHEDULE_CONFIRMATION}" are required` },
      { status: 400 },
    );
  }
  const sendAt = parsed.data.sendAt === "now" ? new Date() : parseSastLocalDateTime(parsed.data.sendAt);
  if (!sendAt) return NextResponse.json({ error: "Choose a valid send date and time" }, { status: 400 });

  const { identity, response } = await authorise();
  if (!identity) return response;
  try {
    const { id } = await params;
    const campaign = await scheduleDashboardCampaign(identity, id, { sendAt, confirmation: parsed.data.confirmation });
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json({ error: safeError(error, "The campaign could not be scheduled") }, { status: 409 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { identity, response } = await authorise();
  if (!identity) return response;
  try {
    const { id } = await params;
    const campaign = await stopDashboardCampaign(identity, id);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json({ error: safeError(error, "The campaign could not be stopped") }, { status: 409 });
  }
}
