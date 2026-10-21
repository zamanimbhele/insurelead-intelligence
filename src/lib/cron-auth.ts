import { timingSafeEqual } from "node:crypto";

// Shared guard for scheduled endpoints under /api/cron/*. Vercel Cron
// sends "Authorization: Bearer $CRON_SECRET" automatically; Supabase
// pg_cron sends the same header from Vault (docs/CAMPAIGN_MCP_SETUP.md).
// Without a configured secret the endpoints refuse to run at all.
export type CronAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

export function checkCronRequest(authorizationHeader: string | null): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorizationHeader ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401, error: "Unauthorised" };
  }
  return { ok: true };
}
