// Multi-factor authentication for platform staff (migration
// 202610280001_admin_mfa.sql). Staff sign in with their password, then
// with a 6-digit code from an authenticator app. Supabase records the
// second step in the session as "aal2"; the database refuses staff
// sessions below aal2, and getDashboardIdentity() sends them to
// /admin/mfa.
//
// The steps here take a narrow `MfaAuth` (the `supabase.auth.mfa` API) so
// they can be tested without Supabase.
import { isPlatformStaffRole } from "./portal.ts";

export const MFA_PAGE = "/admin/mfa";
export const MFA_ISSUER = "InsureLead";

// Attempts per staff member, enforced durably before Supabase is called.
export const MFA_LIMITS = {
  verify: { windowSeconds: 900, maximumRequests: 10 },
  enrol: { windowSeconds: 3600, maximumRequests: 5 },
} as const;

type Factor = { id: string; factor_type: string; status: string };
type Result<T> = { data: T | null; error: { message: string } | null };

export type MfaAuth = {
  listFactors(): Promise<Result<{ all: Factor[] }>>;
  enroll(params: { factorType: "totp"; friendlyName?: string; issuer?: string }): Promise<Result<{ id: string; totp: { qr_code: string; secret: string } }>>;
  unenroll(params: { factorId: string }): Promise<Result<unknown>>;
  challengeAndVerify(params: { factorId: string; code: string }): Promise<Result<unknown>>;
};

export function staffNeedsMfa(role: string | null | undefined, currentLevel: string | null | undefined): boolean {
  return isPlatformStaffRole(role) && currentLevel !== "aal2";
}

export function isMfaCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

// Supabase returns the QR code as an SVG data URL; render nothing else.
export function isQrCodeDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/svg+xml") && value.length < 20_000;
}

function totpFactors(factors: Factor[]) {
  return factors.filter((factor) => factor.factor_type === "totp");
}

export async function verifiedTotpFactor(auth: MfaAuth): Promise<Factor | null> {
  const { data, error } = await auth.listFactors();
  if (error || !data) throw new Error("Your authenticator details could not be loaded");
  return totpFactors(data.all).find((factor) => factor.status === "verified") ?? null;
}

// First-time set-up. Refused when an authenticator is already verified:
// adding another one must not be possible with only the password.
// Unfinished set-ups are removed first so they cannot pile up.
export async function beginEnrolment(auth: MfaAuth, today = new Date()) {
  const { data, error } = await auth.listFactors();
  if (error || !data) throw new Error("Your authenticator details could not be loaded");
  const totp = totpFactors(data.all);
  if (totp.some((factor) => factor.status === "verified")) {
    throw new Error("An authenticator is already set up for this account");
  }
  for (const factor of totp) {
    await auth.unenroll({ factorId: factor.id });
  }
  const enrolled = await auth.enroll({
    factorType: "totp",
    issuer: MFA_ISSUER,
    friendlyName: `${MFA_ISSUER} admin ${today.toISOString().slice(0, 10)}`,
  });
  if (enrolled.error || !enrolled.data || !isQrCodeDataUrl(enrolled.data.totp.qr_code)) {
    throw new Error("The authenticator could not be set up");
  }
  return { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret };
}

// Checks a code for one of the signed-in user's own TOTP factors. Returns
// whether this completed a first-time set-up.
export async function verifyCode(auth: MfaAuth, input: { factorId: unknown; code: unknown }) {
  if (!isMfaCode(input.code)) throw new Error("Enter the 6-digit code from your authenticator app");
  const { data, error } = await auth.listFactors();
  if (error || !data) throw new Error("Your authenticator details could not be loaded");
  const factor = totpFactors(data.all).find((candidate) => candidate.id === input.factorId);
  if (!factor) throw new Error("Start the authenticator set-up again");
  const verified = await auth.challengeAndVerify({ factorId: factor.id, code: input.code });
  if (verified.error) throw new Error("That code did not work. Check the time on your phone and try the newest code");
  return { enrolled: factor.status !== "verified" };
}
