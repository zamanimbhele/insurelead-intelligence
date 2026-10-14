import { NextRequest, NextResponse } from "next/server";

import { processRuntimeCampaignDeliveryWebhookEvent } from "@/lib/campaign-runtime";
import { verifyResendWebhookSignature } from "@/lib/campaign-webhooks";

export const dynamic = "force-dynamic";

// Inbound endpoint for Resend's delivery/engagement webhooks (delivered,
// bounced, complained, opened, clicked) - see docs/CAMPAIGN_MCP_SETUP.md
// section 6 for how to point a Resend webhook at this route. There is no
// Supabase session and no dashboard role to check here: the Svix signature
// Resend attaches is the only trust boundary, so a request that doesn't
// verify is rejected before any lookup or write runs, and every response -
// success or failure - stays generic (no recipient email, lead name, or
// other PII; no detail about *why* a request failed) so this endpoint can
// never be used as an oracle to probe for valid campaign/recipient state.
export async function POST(request: NextRequest) {
  // Signature verification is byte-sensitive, so the raw, untouched body
  // text is read first and reused for both verification and parsing -
  // never request.json() followed by a re-stringify for verification.
  const rawBody = await request.text();
  const verified = verifyResendWebhookSignature(rawBody, {
    svixId: request.headers.get("svix-id"),
    svixTimestamp: request.headers.get("svix-timestamp"),
    svixSignature: request.headers.get("svix-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: { type?: unknown; data?: { email_id?: unknown } } | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }
  const resendEventType = typeof payload?.type === "string" ? payload.type : undefined;
  const providerMessageId = typeof payload?.data?.email_id === "string" ? payload.data.email_id : undefined;
  const svixId = request.headers.get("svix-id");

  if (!resendEventType || !providerMessageId || !svixId) {
    // A signature-verified request with a body shape this route doesn't
    // recognise - acknowledge it so Resend does not retry something that
    // can never succeed, but do nothing with it.
    return NextResponse.json({ ok: true, processed: false });
  }

  try {
    const result = await processRuntimeCampaignDeliveryWebhookEvent({
      providerMessageId,
      resendEventType,
      svixId,
    });
    return NextResponse.json({ ok: true, processed: result.outcome === "processed", outcome: result.outcome });
  } catch {
    // A transient data-layer failure (e.g. Supabase unreachable) - return
    // 500 so Resend's own retry schedule has a chance to redeliver later,
    // rather than swallowing a failure Resend could otherwise recover from.
    return NextResponse.json({ error: "Unable to process webhook event" }, { status: 500 });
  }
}
