import { NextRequest, NextResponse } from "next/server";

import { suppressRuntimeCampaignRecipient } from "@/lib/campaign-runtime";
import { verifyCampaignUnsubscribeToken } from "@/lib/campaign-unsubscribe";

export const dynamic = "force-dynamic";

function responsePage(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:48px"><main style="max-width:560px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:32px"><h1>${title}</h1><p>${message}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function tokenFrom(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return { token, payload: verifyCampaignUnsubscribeToken(token) };
}

export async function GET(request: NextRequest) {
  const { token, payload } = tokenFrom(request);
  if (!payload) return responsePage("Link unavailable", "This unsubscribe link is invalid or has expired.", 400);
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title></head><body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:48px"><main style="max-width:560px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:32px"><h1>Stop campaign messages?</h1><p>This will stop marketing campaigns from this broker for your email address.</p><form method="post" action="/api/campaigns/unsubscribe?token=${token}"><button type="submit" style="background:#2848e8;color:white;border:0;border-radius:6px;padding:12px 18px;font-weight:600">Unsubscribe</button></form></main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const { payload } = tokenFrom(request);
  if (!payload) return responsePage("Link unavailable", "This unsubscribe link is invalid or has expired.", 400);
  try {
    await suppressRuntimeCampaignRecipient({
      organisationId: payload.organisationId,
      campaignId: payload.campaignId,
      leadId: payload.leadId,
      reason: "recipient_request",
    });
    return responsePage("You are unsubscribed", "Campaign marketing from this broker has been stopped for this address.");
  } catch {
    return responsePage("Unable to unsubscribe", "Please contact the broker or platform compliance team for assistance.", 500);
  }
}
