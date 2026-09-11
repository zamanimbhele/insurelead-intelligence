import type { Lead } from "./types.ts";

type NotificationResult = "disabled" | "sent" | "failed";

function getWebhookConfig() {
  const rawUrl = process.env.LEAD_NOTIFICATION_WEBHOOK_URL?.trim();
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const localDevelopmentUrl = process.env.NODE_ENV !== "production"
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopmentUrl) return false;
    return {
      url: url.toString(),
      token: process.env.LEAD_NOTIFICATION_WEBHOOK_TOKEN?.trim(),
    };
  } catch {
    return false;
  }
}

export function getLeadNotificationStatus() {
  const config = getWebhookConfig();
  if (config === null) return "disabled" as const;
  return config === false ? "invalid" as const : "configured" as const;
}

export async function notifyLeadCreated(leadId: string, lead: Omit<Lead, "id" | "createdAt">): Promise<NotificationResult> {
  const config = getWebhookConfig();
  if (config === null) return "disabled";
  if (config === false) return "failed";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let dashboardUrl: string | undefined;
  if (appUrl) {
    try {
      dashboardUrl = new URL(`/dashboard/leads/${leadId}`, appUrl).toString();
    } catch {
      dashboardUrl = undefined;
    }
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        event: "lead.created",
        leadId,
        applicantType: lead.applicantType,
        businessName: lead.businessName,
        industry: lead.industry,
        province: lead.province,
        city: lead.city,
        insuranceProducts: lead.insuranceProducts,
        businessCoverInterests: lead.businessCoverInterests,
        preferredContactChannel: lead.preferredContactChannel,
        score: lead.score,
        scoreBand: lead.scoreBand,
        campaignSource: lead.campaignSource,
        dashboardUrl,
        createdAt: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
