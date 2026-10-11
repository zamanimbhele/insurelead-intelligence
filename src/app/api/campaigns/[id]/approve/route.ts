import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canApproveCampaigns, getDashboardIdentity } from "@/lib/auth";
import { approveDashboardCampaign } from "@/lib/dashboard-data";

// Dashboard counterpart to the MCP server's approve_campaign tool. The
// attestation string is an exact z.literal match on both sides of the
// dual-mode split (approveDashboardCampaign() in dashboard-data.ts, and
// the approve_campaign_content RPC server-side in Supabase mode) - this
// is the one explicit human sign-off the whole campaign pipeline is
// gated on, so it is never inferred from a checkbox alone.
const schema = z.object({
  attestation: z.literal("I approve this campaign for delivery"),
});

const safeErrors = [
  "Only a broker administrator or platform administrator may approve a campaign",
  "Campaign not found",
  "Only a draft or pending-review campaign can be approved",
  "Current content could not be loaded",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? (message || "The campaign could not be approved");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The exact attestation "I approve this campaign for delivery" is required' },
      { status: 400 },
    );
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canApproveCampaigns(identity)) {
    return NextResponse.json(
      { error: "Only a broker administrator or platform administrator may approve a campaign" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const campaign = await approveDashboardCampaign(identity, id, parsed.data.attestation);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
