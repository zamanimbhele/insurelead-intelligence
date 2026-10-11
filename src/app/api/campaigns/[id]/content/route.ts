import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCampaigns, getDashboardIdentity } from "@/lib/auth";
import { generateDashboardCampaignContent } from "@/lib/dashboard-data";

// Dashboard counterpart to the MCP server's generate_campaign_content
// tool. Generation only ever creates a new, unapproved content version -
// saveSupabaseCampaignContent()'s underlying RPC always resets any prior
// approval, so this can never silently resurrect an old sign-off.
const schema = z.object({
  keyMessage: z.string().trim().min(10).max(1000),
  callToActionLabel: z.string().trim().min(2).max(80),
  callToActionUrl: z.string().trim().url().refine((value) => value.startsWith("https://"), "The call-to-action link must use HTTPS"),
});

const safeErrors = [
  "Only a broker administrator, campaign manager, or platform administrator may author campaign content",
  "Campaign not found",
  "Campaign content can no longer be changed",
  "Campaign broker not found",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The campaign content could not be generated";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A key message (10-1000 characters), a call-to-action label, and an https call-to-action link are required" },
      { status: 400 },
    );
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCampaigns(identity)) {
    return NextResponse.json(
      { error: "Only a broker administrator, campaign manager, or platform administrator may author campaign content" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const content = await generateDashboardCampaignContent(identity, id, parsed.data);
    return NextResponse.json({ ok: true, content });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
