// Where Supabase email links land, and where they may continue to.
// Kept as an allowlist so a crafted link can never bounce someone to an
// arbitrary page (or another site) after signing them in.
export const AUTH_CONFIRM_PATH = "/auth/confirm";

const ALLOWED_NEXT = new Set(["/reset-password", "/reset-password?flow=invite"]);

export function safeAuthNext(value: string | null | undefined): string | null {
  return value && ALLOWED_NEXT.has(value) ? value : null;
}

// A recovery email sent within this window means a "code" link with no
// explicit destination is almost certainly a password reset.
export const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

export function isRecentRecovery(recoverySentAt: string | null | undefined, now = Date.now()): boolean {
  if (!recoverySentAt) return false;
  const sent = Date.parse(recoverySentAt);
  return Number.isFinite(sent) && sent <= now + 60_000 && now - sent <= RECOVERY_WINDOW_MS;
}

// The public origin used in links we ask Supabase to send. Prefers the
// configured app URL; falls back to the request's own host (preview
// deployments). Supabase only honours it if it is in the project's
// Redirect URLs list, so a spoofed host cannot redirect anywhere.
export function appOrigin(configured: string | undefined, host: string | null, proto: string | null): string | null {
  const fromEnv = configured?.trim().replace(/\/+$/, "");
  if (fromEnv && /^https?:\/\//.test(fromEnv)) return fromEnv;
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  return `${proto === "http" ? "http" : "https"}://${host}`;
}
