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

// The Turnstile site key to show on a form, or undefined when the captcha
// is off (or misconfigured: the server check then reports it).
export function safeCaptchaSiteKey(): string | undefined {
  try {
    return getCaptchaMode() === "turnstile" ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined : undefined;
  } catch {
    return undefined;
  }
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

// Turnstile "actions" per form, so a token solved on one form cannot be
// replayed on another.
export type CaptchaAction = "lead_consultation" | "account_signup" | "password_reset";

export async function verifyLeadCaptcha(token: string | undefined, clientIp: string) {
  return verifyCaptcha(token, clientIp, "lead_consultation");
}

export async function verifyCaptcha(token: string | undefined, clientIp: string, action: CaptchaAction) {
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
  return result.success === true && result.action === action;
}
