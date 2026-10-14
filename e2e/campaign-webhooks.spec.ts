import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

// This is a narrow, black-box test of /api/webhooks/resend's own trust
// boundary and response contract (the same style health.spec.ts and
// rate-limit.spec.ts already use for an API endpoint with no page UI of
// its own), not a full happy-path test: reaching a "processed: true,
// matched recipient" response requires a campaign_recipients row already
// in "sent" status with a known providerMessageId, which in this codebase
// only the Campaign Orchestration MCP server's launch_campaign tool can
// produce (the dashboard deliberately has no launch action - see
// BACKLOG.md's "Visual campaign authoring" entry) - not reachable from
// e2e's black-box HTTP surface. The full matched/duplicate/bounced-
// suppression/terminal-status-protection behaviour is covered instead by
// src/lib/campaign-webhooks.test.ts (the pure decision logic) and an
// isolated runtime script exercising processRuntimeCampaignDeliveryWebhookEvent
// end to end against a throwaway demo-store workspace (see BACKLOG.md).
//
// Signatures below are computed with the same fixed demo secret
// getResendWebhookSecret() always returns in demo mode (src/lib/
// campaign-webhooks.ts's DEMO_WEBHOOK_SECRET) - scripts/run-e2e.mjs forces
// demo mode for this whole suite, so this value is deterministic here.
const DEMO_SECRET = "whsec_insurelead_demo_resend_webhook_secret_not_for_production";

function sign(svixId: string, svixTimestamp: string, body: string) {
  const secretBytes = Buffer.from(DEMO_SECRET.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", secretBytes).update(`${svixId}.${svixTimestamp}.${body}`).digest("base64");
  return `v1,${digest}`;
}

function signedHeaders(body: string) {
  const svixId = `msg_e2e_${Date.now()}`;
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  return {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": sign(svixId, svixTimestamp, body),
    "Content-Type": "application/json",
  };
}

test("rejects a request with no signature headers at all", async ({ request }) => {
  const response = await request.post("/api/webhooks/resend", {
    data: { type: "email.delivered", data: { email_id: "re_not_real" } },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "Invalid webhook signature" });
});

test("rejects a request signed with the wrong secret", async ({ request }) => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_not_real" } });
  const svixId = `msg_e2e_${Date.now()}`;
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const wrongSecretBytes = Buffer.from("not-the-right-secret-at-all", "utf8");
  const wrongSignature = `v1,${createHmac("sha256", wrongSecretBytes).update(`${svixId}.${svixTimestamp}.${body}`).digest("base64")}`;

  const response = await request.post("/api/webhooks/resend", {
    data: body,
    headers: {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": wrongSignature,
      "Content-Type": "application/json",
    },
  });
  expect(response.status()).toBe(401);
});

test("acknowledges, but does not process, a correctly signed event with no matching recipient", async ({ request }) => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_no_such_recipient_in_this_run" } });
  const response = await request.post("/api/webhooks/resend", { data: body, headers: signedHeaders(body) });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true, processed: false, outcome: "unmatched" });
});

test("acknowledges, but does not process, a correctly signed event type this platform does not act on", async ({ request }) => {
  const body = JSON.stringify({ type: "email.delivery_delayed", data: { email_id: "re_no_such_recipient_in_this_run" } });
  const response = await request.post("/api/webhooks/resend", { data: body, headers: signedHeaders(body) });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true, processed: false, outcome: "ignored" });
});

test("acknowledges a correctly signed but unrecognisable body without erroring", async ({ request }) => {
  const body = JSON.stringify({ unexpected: "shape" });
  const response = await request.post("/api/webhooks/resend", { data: body, headers: signedHeaders(body) });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true, processed: false });
});
