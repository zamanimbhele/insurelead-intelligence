import { randomUUID } from "node:crypto";
import { PublicSubmissionUnavailableError } from "./errors.ts";

type CaptchaMode = "off" | "turnstile";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
};

export function getCaptchaMode(): CaptchaMode {
  const configuredMode = process.env.INSURELEAD_CAPTCHA_MODE?.trim().toLowerCase() || "off";
  if (configuredMode === "off" || configuredMode === "turnstile") return configuredMode;
  throw new PublicSubmissionUnavailableError("CAPTCHA mode is invalid");
}

export function getCaptchaStatus() {
  let mode: CaptchaMode;
  try {
    mode = getCaptchaMode();
  } catch {
    return "invalid" as const;
  }
  if (mode === "off") return "disabled" as const;
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
    && process.env.TURNSTILE_SECRET_KEY?.trim()
    ? "configured" as const
    : "missing" as const;
}

export async function verifyLeadCaptcha(token: string | undefined, clientIp: string) {
  if (getCaptchaMode() === "off") return true;

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!siteKey || !secretKey) {
    throw new PublicSubmissionUnavailableError("CAPTCHA is not configured");
  }
  if (!token) return false;

  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip: clientIp === "unknown" ? undefined : clientIp,
        idempotency_key: randomUUID(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new PublicSubmissionUnavailableError("CAPTCHA verification is unavailable");
  }

  if (!response.ok) {
    throw new PublicSubmissionUnavailableError("CAPTCHA verification is unavailable");
  }

  const result = await response.json() as TurnstileResponse;
  return result.success === true && result.action === "lead_consultation";
}
