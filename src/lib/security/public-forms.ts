// Protection for public forms that make Supabase send an email (sign-up
// and forgot-password). Bots used these to send confirmation and reset
// emails to strangers through InsureLead's mail. Every check runs BEFORE
// Supabase is asked to send anything, so a blocked request sends no email.
//
//   1. honeypot  - a hidden field people never fill in
//   2. per-IP    - one source cannot hammer the form
//   3. per-email - one inbox cannot be flooded from many IPs
//   4. captcha   - Cloudflare Turnstile, when INSURELEAD_CAPTCHA_MODE=turnstile
import { verifyCaptcha, type CaptchaAction } from "./captcha.ts";
import { checkRateLimit, getClientIp } from "./rate-limit.ts";

export type PublicFormKind = "signup" | "password_reset";
export type GuardResult = "ok" | "honeypot" | "rate_limited" | "captcha_failed";

export const PUBLIC_FORM_LIMITS: Record<PublicFormKind, { perIp: { windowSeconds: number; maximumRequests: number }; perEmail: { windowSeconds: number; maximumRequests: number } }> = {
  signup: {
    perIp: { windowSeconds: 3600, maximumRequests: 5 },
    perEmail: { windowSeconds: 3600, maximumRequests: 2 },
  },
  password_reset: {
    perIp: { windowSeconds: 900, maximumRequests: 5 },
    perEmail: { windowSeconds: 3600, maximumRequests: 3 },
  },
};

const ACTIONS: Record<PublicFormKind, CaptchaAction> = { signup: "account_signup", password_reset: "password_reset" };

export { HONEYPOT_FIELD } from "./public-forms-shared.ts";

type Deps = {
  checkRateLimit: (key: string, limits: { windowSeconds: number; maximumRequests: number }) => Promise<{ allowed: boolean }>;
  verifyCaptcha: (token: string | undefined, ip: string, action: CaptchaAction) => Promise<boolean>;
};

export async function guardPublicForm(
  input: { kind: PublicFormKind; headers: Headers; email: string; honeypot: string; captchaToken?: string },
  deps: Deps = { checkRateLimit, verifyCaptcha },
): Promise<GuardResult> {
  if (input.honeypot.trim()) return "honeypot";
  const ip = getClientIp(input.headers);
  const limits = PUBLIC_FORM_LIMITS[input.kind];
  const [byIp, byEmail] = await Promise.all([
    deps.checkRateLimit(`${input.kind}-ip:${ip}`, limits.perIp),
    deps.checkRateLimit(`${input.kind}-email:${input.email.trim().toLowerCase()}`, limits.perEmail),
  ]);
  if (!byIp.allowed || !byEmail.allowed) return "rate_limited";
  if (!(await deps.verifyCaptcha(input.captchaToken || undefined, ip, ACTIONS[input.kind]))) return "captcha_failed";
  return "ok";
}
