import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  getResendWebhookSecret,
  getResendWebhookStatus,
  mapResendWebhookEventType,
  nextRecipientStatusForWebhookEvent,
  suppressionReasonForWebhookEvent,
  verifyResendWebhookSignature,
} from "./campaign-webhooks";

// A real-looking, well-formed secret (base64 payload is arbitrary - Resend's
// own secrets are just base64-encoded random bytes after the "whsec_"
// prefix). Independently signs a payload the same way Resend/Svix documents
// (https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests),
// rather than reusing the module under test, so the test exercises the
// documented external contract rather than the implementation's own logic
// twice over.
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

function sign(svixId: string, svixTimestamp: string, body: string, secret = SECRET) {
  const secretBytes = Buffer.from(secret.slice("whsec_".length), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const digest = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${digest}`;
}

function freshHeaders(body: string, overrides: Partial<{ svixId: string; svixTimestamp: string }> = {}) {
  const svixId = overrides.svixId ?? "msg_test_1";
  const svixTimestamp = overrides.svixTimestamp ?? String(Math.floor(Date.now() / 1000));
  return { svixId, svixTimestamp, svixSignature: sign(svixId, svixTimestamp, body) };
}

describe("verifyResendWebhookSignature", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_abc123" } });

  it("accepts a correctly signed, fresh request", () => {
    const headers = freshHeaders(body);
    expect(verifyResendWebhookSignature(body, headers, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const headers = freshHeaders(body);
    const tamperedBody = JSON.stringify({ type: "email.delivered", data: { email_id: "re_someone_elses_message" } });
    expect(verifyResendWebhookSignature(tamperedBody, headers, SECRET)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const { svixId, svixTimestamp } = freshHeaders(body);
    const wrongSignature = sign(svixId, svixTimestamp, body, "whsec_differentSecretValueHere000000");
    expect(
      verifyResendWebhookSignature(body, { svixId, svixTimestamp, svixSignature: wrongSignature }, SECRET),
    ).toBe(false);
  });

  it("rejects a stale timestamp outside the replay-protection window", () => {
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const headers = freshHeaders(body, { svixTimestamp: staleTimestamp });
    expect(verifyResendWebhookSignature(body, headers, SECRET)).toBe(false);
  });

  it("rejects when any required header is missing", () => {
    const headers = freshHeaders(body);
    expect(verifyResendWebhookSignature(body, { ...headers, svixId: null }, SECRET)).toBe(false);
    expect(verifyResendWebhookSignature(body, { ...headers, svixTimestamp: null }, SECRET)).toBe(false);
    expect(verifyResendWebhookSignature(body, { ...headers, svixSignature: null }, SECRET)).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    const headers = freshHeaders(body);
    expect(verifyResendWebhookSignature(body, headers, null)).toBe(false);
  });

  it("matches one valid signature among several space-separated candidates", () => {
    const { svixId, svixTimestamp } = freshHeaders(body);
    const wrongSignature = sign(svixId, svixTimestamp, body, "whsec_differentSecretValueHere000000");
    const correctSignature = sign(svixId, svixTimestamp, body, SECRET);
    const svixSignature = `${wrongSignature} ${correctSignature}`;
    expect(verifyResendWebhookSignature(body, { svixId, svixTimestamp, svixSignature }, SECRET)).toBe(true);
  });
});

describe("getResendWebhookStatus / getResendWebhookSecret", () => {
  // The test runtime has no INSURELEAD_DATA_MODE set, so getDataMode()
  // defaults to "demo" (src/lib/supabase/config.ts) for every test in this
  // file unless a test explicitly overrides it - matching how the e2e
  // suite also always runs in forced demo mode (scripts/run-e2e.mjs).
  it("always reports configured in demo mode, ignoring any env override", () => {
    const original = process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      expect(getResendWebhookStatus()).toBe("configured");
      const demoSecret = getResendWebhookSecret();
      expect(demoSecret).toMatch(/^whsec_/);
      // Setting a real-looking env value must not change the demo secret -
      // demo mode never trusts the environment for this, the same
      // convention campaign-unsubscribe.ts's getSecret() already follows.
      process.env.RESEND_WEBHOOK_SECRET = SECRET;
      expect(getResendWebhookSecret()).toBe(demoSecret);
    } finally {
      if (original === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = original;
    }
  });

  it("in supabase mode, reports missing-secret when RESEND_WEBHOOK_SECRET is unset", () => {
    const originalMode = process.env.INSURELEAD_DATA_MODE;
    const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
    process.env.INSURELEAD_DATA_MODE = "supabase";
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      expect(getResendWebhookStatus()).toBe("missing-secret");
      expect(getResendWebhookSecret()).toBeNull();
    } finally {
      if (originalMode === undefined) delete process.env.INSURELEAD_DATA_MODE;
      else process.env.INSURELEAD_DATA_MODE = originalMode;
      if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("in supabase mode, reports configured once a well-formed secret is set", () => {
    const originalMode = process.env.INSURELEAD_DATA_MODE;
    const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
    process.env.INSURELEAD_DATA_MODE = "supabase";
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    try {
      expect(getResendWebhookStatus()).toBe("configured");
      expect(getResendWebhookSecret()).toBe(SECRET);
    } finally {
      if (originalMode === undefined) delete process.env.INSURELEAD_DATA_MODE;
      else process.env.INSURELEAD_DATA_MODE = originalMode;
      if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });
});

describe("mapResendWebhookEventType", () => {
  it("maps every subscribed Resend event type", () => {
    expect(mapResendWebhookEventType("email.delivered")).toBe("delivered");
    expect(mapResendWebhookEventType("email.bounced")).toBe("bounced");
    expect(mapResendWebhookEventType("email.complained")).toBe("complained");
    expect(mapResendWebhookEventType("email.opened")).toBe("opened");
    expect(mapResendWebhookEventType("email.clicked")).toBe("clicked");
  });

  it("returns null for a type this platform does not act on", () => {
    expect(mapResendWebhookEventType("email.sent")).toBeNull();
    expect(mapResendWebhookEventType("email.delivery_delayed")).toBeNull();
    expect(mapResendWebhookEventType("some.future.event.type")).toBeNull();
  });
});

describe("nextRecipientStatusForWebhookEvent", () => {
  it("moves a sent recipient to delivered on a delivered event", () => {
    expect(nextRecipientStatusForWebhookEvent("sent", "delivered")).toBe("delivered");
  });

  it("does not move a queued recipient to delivered (it was never sent)", () => {
    expect(nextRecipientStatusForWebhookEvent("queued", "delivered")).toBeNull();
  });

  it("moves a sent recipient to bounced or complained", () => {
    expect(nextRecipientStatusForWebhookEvent("sent", "bounced")).toBe("bounced");
    expect(nextRecipientStatusForWebhookEvent("sent", "complained")).toBe("complained");
  });

  it("never regresses a terminal status, even from a later bounce/complaint", () => {
    for (const status of ["bounced", "complained", "suppressed", "failed"] as const) {
      expect(nextRecipientStatusForWebhookEvent(status, "delivered")).toBeNull();
      expect(nextRecipientStatusForWebhookEvent(status, "bounced")).toBeNull();
      expect(nextRecipientStatusForWebhookEvent(status, "complained")).toBeNull();
    }
  });

  it("never changes status for a pure engagement event (opened/clicked)", () => {
    expect(nextRecipientStatusForWebhookEvent("sent", "opened")).toBeNull();
    expect(nextRecipientStatusForWebhookEvent("delivered", "clicked")).toBeNull();
  });
});

describe("suppressionReasonForWebhookEvent", () => {
  it("maps bounced and complained to their suppression reasons", () => {
    expect(suppressionReasonForWebhookEvent("bounced")).toBe("bounce");
    expect(suppressionReasonForWebhookEvent("complained")).toBe("complaint");
  });

  it("returns null for events that should not suppress future sends", () => {
    expect(suppressionReasonForWebhookEvent("delivered")).toBeNull();
    expect(suppressionReasonForWebhookEvent("opened")).toBeNull();
    expect(suppressionReasonForWebhookEvent("clicked")).toBeNull();
  });
});
