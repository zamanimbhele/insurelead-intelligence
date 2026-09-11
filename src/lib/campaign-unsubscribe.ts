import { createHmac, timingSafeEqual } from "node:crypto";

import { getDataMode } from "./supabase/config.ts";

type UnsubscribePayload = {
  campaignId: string;
  organisationId: string;
  leadId: string;
  expiresAt: number;
};

function getSecret() {
  if (getDataMode() === "demo") return "insurelead-demo-unsubscribe-secret-not-for-production";
  const secret = process.env.CAMPAIGN_UNSUBSCRIBE_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function getCampaignUnsubscribeStatus() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!getSecret()) return "missing-secret" as const;
  if (!appUrl) return "missing-app-url" as const;
  try {
    const url = new URL(appUrl);
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    return url.protocol === "https:" || local ? "configured" as const : "invalid-app-url" as const;
  } catch {
    return "invalid-app-url" as const;
  }
}

export function createCampaignUnsubscribeToken(
  input: Omit<UnsubscribePayload, "expiresAt"> & { expiresInDays?: number },
) {
  const secret = getSecret();
  if (!secret) throw new Error("CAMPAIGN_UNSUBSCRIBE_SECRET must contain at least 32 characters");
  const payload: UnsubscribePayload = {
    campaignId: input.campaignId,
    organisationId: input.organisationId,
    leadId: input.leadId,
    expiresAt: Date.now() + (input.expiresInDays ?? 365) * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyCampaignUnsubscribeToken(token: string): UnsubscribePayload | null {
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UnsubscribePayload;
    if (!payload.campaignId || !payload.organisationId || !payload.leadId || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createCampaignUnsubscribeUrl(input: Omit<UnsubscribePayload, "expiresAt">) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    || (getDataMode() === "demo" ? "http://localhost:3000" : undefined);
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is required for campaign delivery");
  const url = new URL("/api/campaigns/unsubscribe", appUrl);
  url.searchParams.set("token", createCampaignUnsubscribeToken(input));
  return url.toString();
}
