import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin.ts";
import { getDataMode } from "../supabase/config.ts";
import { checkSupabaseSubmissionRateLimit } from "../supabase/data.ts";
import { PublicSubmissionUnavailableError } from "./errors.ts";

const demoSubmissionLog = new Map<string, number[]>();
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 5;

function readBoundedInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

export function getClientIp(headers: Headers) {
  const forwardedIp = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedIp) return forwardedIp;

  const cloudflareIp = headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function getRateLimitStatus() {
  if (getDataMode() === "demo") return "demo-only" as const;
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  return secret && secret.length >= 32 ? "configured" as const : "missing" as const;
}

export async function checkLeadSubmissionRateLimit(headers: Headers) {
  const windowSeconds = readBoundedInteger(
    process.env.LEAD_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_WINDOW_SECONDS,
    86_400,
  );
  const maximumRequests = readBoundedInteger(
    process.env.LEAD_RATE_LIMIT_MAX,
    DEFAULT_MAX_REQUESTS,
    100,
  );
  return checkRateLimit(`lead-submission:${getClientIp(headers)}`, { windowSeconds, maximumRequests });
}

// Any public form: `key` names what is limited (for example
// "signup-ip:203.0.113.5" or "reset-email:someone@example.com"). Keys are
// stored only as an HMAC, never in the clear.
export async function checkRateLimit(key: string, limits: { windowSeconds: number; maximumRequests: number }) {
  const { windowSeconds, maximumRequests } = limits;

  if (getDataMode() === "demo") {
    const now = Date.now();
    const cutoff = now - windowSeconds * 1_000;
    const timestamps = (demoSubmissionLog.get(key) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    timestamps.push(now);
    demoSubmissionLog.set(key, timestamps);
    return { allowed: timestamps.length <= maximumRequests, retryAfterSeconds: windowSeconds };
  }

  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new PublicSubmissionUnavailableError("Durable rate limiting is not configured");
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    throw new PublicSubmissionUnavailableError("Supabase server access is not configured");
  }

  const keyHash = createHmac("sha256", secret)
    .update(key)
    .digest("hex");
  let allowed: boolean;
  try {
    allowed = await checkSupabaseSubmissionRateLimit(client, {
      keyHash,
      maximumRequests,
      windowSeconds,
    });
  } catch {
    throw new PublicSubmissionUnavailableError("Durable rate limiting is unavailable");
  }

  return { allowed, retryAfterSeconds: windowSeconds };
}
