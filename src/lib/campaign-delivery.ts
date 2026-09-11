import type { BrokerSendingIdentity } from "./types.ts";

export type CampaignDeliveryMode = "disabled" | "test" | "live";

export function getCampaignDeliveryMode(): CampaignDeliveryMode {
  const configured = process.env.INSURELEAD_CAMPAIGN_DELIVERY_MODE?.trim();
  if (!configured || configured === "disabled") return "disabled";
  if (configured === "test" || configured === "live") return configured;
  throw new Error("INSURELEAD_CAMPAIGN_DELIVERY_MODE must be disabled, test, or live");
}

export function getCampaignDeliveryStatus() {
  let mode: CampaignDeliveryMode;
  try {
    mode = getCampaignDeliveryMode();
  } catch {
    return "invalid" as const;
  }
  if (mode === "disabled") return "disabled" as const;
  return process.env.RESEND_API_KEY?.trim() ? mode : "missing-api-key" as const;
}

export async function sendCampaignEmail(input: {
  sendingIdentity: BrokerSendingIdentity;
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
  idempotencyKey: string;
  campaignId: string;
}): Promise<{ providerMessageId: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is required for campaign delivery");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: `${input.sendingIdentity.fromName} <${input.sendingIdentity.fromEmail}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.sendingIdentity.replyToEmail ? { reply_to: input.sendingIdentity.replyToEmail } : {}),
      headers: {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "campaign_id", value: input.campaignId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 256) }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok || !payload.id) {
    throw new Error(payload.message ?? `Resend rejected campaign delivery with HTTP ${response.status}`);
  }
  return { providerMessageId: payload.id };
}
