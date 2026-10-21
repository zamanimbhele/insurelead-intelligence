import { NextRequest, NextResponse } from "next/server";
import { checkCronRequest } from "@/lib/cron-auth";
import { runTaskDigest } from "@/lib/task-digest-runtime";

// Daily task digest, triggered once each morning by Vercel Cron
// (vercel.json, 04:00 UTC = 06:00 SAST) or Supabase pg_cron. Re-running
// the same day is harmless: anyone already emailed today is skipped.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: NextRequest) {
  const auth = checkCronRequest(request.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const summary = await runTaskDigest(new Date());
  console.info("[task-digest] run complete", summary);
  return NextResponse.json({ ok: true, ...summary });
}

export const GET = run;
export const POST = run;
