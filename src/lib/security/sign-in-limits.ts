// Rate limits for password sign-in (/login and /admin/login).
//
// Sign-in runs in a Server Action, so Supabase Auth sees the server's IP
// address, not the person's: its own per-IP limits cannot single out an
// attacker. These limits use the person's IP and the email being tried,
// stored durably (HMAC-keyed, see rate-limit.ts), and run BEFORE the
// password is checked.
//
//   per IP    - one source cannot try many accounts or passwords
//   per email - one account cannot be guessed from many IPs
//
// The per-email limit also means someone could block sign-in to an
// account they know the email of, for at most one window. That is the
// usual trade-off; the window is short.
import { checkRateLimit, getClientIp } from "./rate-limit.ts";

export type SignInScope = "broker" | "admin";

export const SIGN_IN_LIMITS = {
  perIp: { windowSeconds: 900, maximumRequests: 30 },
  perEmail: { windowSeconds: 900, maximumRequests: 10 },
} as const;

type Deps = {
  checkRateLimit: (key: string, limits: { windowSeconds: number; maximumRequests: number }) => Promise<{ allowed: boolean }>;
};

// Returns true when this attempt may go ahead. Throws when the limit
// store is unavailable (the caller shows "temporarily unavailable" rather
// than letting unlimited attempts through).
export async function allowSignInAttempt(
  input: { scope: SignInScope; headers: Headers; email: string },
  deps: Deps = { checkRateLimit },
): Promise<boolean> {
  const ip = getClientIp(input.headers);
  const email = input.email.trim().toLowerCase();
  const [byIp, byEmail] = await Promise.all([
    deps.checkRateLimit(`sign-in-${input.scope}-ip:${ip}`, SIGN_IN_LIMITS.perIp),
    deps.checkRateLimit(`sign-in-email:${email}`, SIGN_IN_LIMITS.perEmail),
  ]);
  return byIp.allowed && byEmail.allowed;
}
