// Platform-to-staff email (task digests and future operational notices).
// Separate from campaign delivery: campaign emails go from each broker's
// own verified sending identity to consented leads; these go from the
// platform's own address to InsureLead users about their work.
//
// Requires RESEND_API_KEY and NOTIFICATION_EMAIL_FROM (an address on a
// domain verified in Resend, e.g. "InsureLead <notifications@insurelead.online>").

export type TransactionalEmailStatus = "configured" | "missing-from" | "missing-api-key";

export function getTransactionalEmailStatus(): TransactionalEmailStatus {
  if (!process.env.RESEND_API_KEY?.trim()) return "missing-api-key";
  if (!process.env.NOTIFICATION_EMAIL_FROM?.trim()) return "missing-from";
  return "configured";
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  tag: string;
}): Promise<{ providerMessageId: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFICATION_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and NOTIFICATION_EMAIL_FROM are required for notification email");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: [{ name: "notification", value: input.tag.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 256) }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok || !payload.id) {
    throw new Error(payload.message ?? `Resend rejected the notification with HTTP ${response.status}`);
  }
  return { providerMessageId: payload.id };
}
