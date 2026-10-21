import { NextRequest, NextResponse } from "next/server";
import { checkCronRequest } from "@/lib/cron-auth";
import { runCampaignScheduler } from "@/lib/campaign-sender";
import { listRuntimeDueCampaigns } from "@/lib/campaign-runtime";

// Scheduled sender: called every few minutes by Vercel Cron or Supabase
// pg_cron (see docs/CAMPAIGN_MCP_SETUP.md). Each run gives every due
// campaign at most one batch, within the tenant's quota, and stops
// starting new work after a time budget so it finishes inside the
// function limit. Anything not reached simply waits for the next run.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;

async function run(request: NextRequest) {
  const auth = checkCronRequest(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const startedAt = new Date();
  const outcomes = await runCampaignScheduler({
    listDue: listRuntimeDueCampaigns,
    now: startedAt,
    deadline: startedAt.getTime() + TIME_BUDGET_MS,
  });
  const summary = {
    campaigns: outcomes.length,
    sent: outcomes.reduce((total, outcome) => total + (outcome.sent ?? 0), 0),
    errors: outcomes.filter((outcome) => outcome.outcome === "error").length,
  };
  console.info("[campaign-scheduler] run complete", summary);
  return NextResponse.json({ ok: true, ranAt: startedAt.toISOString(), ...summary, outcomes });
}

export const GET = run;
export const POST = run;
