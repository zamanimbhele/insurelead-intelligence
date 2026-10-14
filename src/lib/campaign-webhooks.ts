import { createHmac, timingSafeEqual } from "node:crypto";

import { getDataMode } from "./supabase/config.ts";
import type { CampaignEventType, CampaignRecipientStatus, MarketingSuppression } from "./types.ts";

// Same convention as campaign-unsubscribe.ts's getSecret(): demo mode never
// has a real Resend account behind it, so it always uses this fixed,
// clearly-labelled value regardless of any RESEND_WEBHOOK_SECRET in the
// environment - predictable for local demo use and for the e2e suite
// (scripts/run-e2e.mjs forces demo mode), and never confusable with a real
// production secret.
const DEMO_WEBHOOK_SECRET = "whsec_insurelead_demo_resend_webhook_secret_not_for_production";

// Resend signs delivery/engagement webhooks using Svix:
// https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
// signedContent = `${svixId}.${svixTimestamp}.${rawBody}`; the secret Resend
// shows is "whsec_<base64>" - the base64 part, decoded, is the HMAC key.
// This module only verifies the signature and decides what a verified event
// means; it never performs I/O itself (no fetch, no database, no file
// access) so it can be unit-tested directly, the same convention as
// campaign-policy.ts and campaign-unsubscribe.ts.
const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export function getResendWebhookSecret() {
  if (getDataMode() === "demo") return DEMO_WEBHOOK_SECRET;
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  return secret && secret.startsWith("whsec_") && secret.length > "whsec_".length ? secret : null;
}

export function getResendWebhookStatus() {
  return getResendWebhookSecret() ? ("configured" as const) : ("missing-secret" as const);
}

export type ResendWebhookHeaders = {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
};

/**
 * Verifies a Resend/Svix webhook signature against the exact raw request
 * body (signature verification is byte-sensitive, so callers must pass the
 * untouched body text, never a re-serialised JSON.parse/stringify round
 * trip). Also rejects a timestamp outside a 5-minute tolerance window, the
 * same replay-protection window Svix itself documents and verifies.
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: ResendWebhookHeaders,
  secret: string | null = getResendWebhookSecret(),
): boolean {
  if (!secret) return false;
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > SVIX_TIMESTAMP_TOLERANCE_SECONDS) return false;

  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secret.slice("whsec_".length), "base64");
  } catch {
    return false;
  }
  if (secretBytes.length === 0) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedBuffer = createHmac("sha256", secretBytes).update(signedContent).digest();

  // svix-signature can carry several space-separated "v1,<base64>" values
  // (signing-secret rotation support); a match against any one is valid.
  return svixSignature
    .split(" ")
    .filter(Boolean)
    .some((candidate) => {
      const [version, signature] = candidate.split(",");
      if (version !== "v1" || !signature) return false;
      let actualBuffer: Buffer;
      try {
        actualBuffer = Buffer.from(signature, "base64");
      } catch {
        return false;
      }
      return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
    });
}

const RESEND_EVENT_TYPE_MAP: Record<string, CampaignEventType | undefined> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

/**
 * Maps a Resend webhook `type` string to this platform's internal
 * CampaignEventType, or null for a type we don't act on (for example
 * "email.sent"/"email.delivery_delayed" - sends are already recorded
 * locally at send time, and a delay is not an outcome). Returning null
 * rather than throwing lets the webhook route acknowledge (200) an event
 * type Resend adds in the future without erroring or retrying forever.
 */
export function mapResendWebhookEventType(resendType: string): CampaignEventType | null {
  return RESEND_EVENT_TYPE_MAP[resendType] ?? null;
}

const TERMINAL_RECIPIENT_STATUSES: CampaignRecipientStatus[] = ["bounced", "complained", "suppressed", "failed"];

/**
 * Decides whether a webhook-confirmed event should move a recipient's
 * status, or returns null to leave it unchanged. A status already in a
 * terminal state is never regressed by a later webhook delivery - Resend
 * does not guarantee delivery order, so a "delivered" notification
 * arriving after a "bounced" one (or a duplicate of either) must not
 * resurrect a recipient. "opened"/"clicked" never change status at all:
 * CampaignRecipientStatus has no corresponding state for them, so they are
 * recorded only as events (see appendRuntimeCampaignEvent).
 */
export function nextRecipientStatusForWebhookEvent(
  currentStatus: CampaignRecipientStatus,
  eventType: CampaignEventType,
): CampaignRecipientStatus | null {
  if (TERMINAL_RECIPIENT_STATUSES.includes(currentStatus)) return null;
  if (eventType === "delivered") return currentStatus === "sent" ? "delivered" : null;
  if (eventType === "bounced") return "bounced";
  if (eventType === "complained") return "complained";
  return null;
}

/**
 * A bounce or complaint also closes the loop into the existing
 * broker-level marketing-suppression list (the same list a recipient's own
 * unsubscribe click writes to), so neither this nor any future campaign
 * for this broker ever re-targets that address - without this, a hard
 * bounce would otherwise just sit as a recipient-status footnote and keep
 * being re-selected by future campaigns.
 */
export function suppressionReasonForWebhookEvent(
  eventType: CampaignEventType,
): MarketingSuppression["reason"] | null {
  if (eventType === "bounced") return "bounce";
  if (eventType === "complained") return "complaint";
  return null;
}
