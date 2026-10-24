import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { isRecentRecovery, safeAuthNext } from "@/lib/auth-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Single landing route for every Supabase email link. Two link formats
// are accepted:
//
// 1. token_hash links from the custom templates in docs/SUPABASE_SETUP.md:
//      type=signup | email_change -> /login?message=email_confirmed
//      type=recovery              -> /reset-password (choose a new password)
//      type=invite                -> /reset-password?flow=invite
// 2. code links from Supabase's default "{{ .ConfirmationURL }}" template,
//    which arrive here via the redirectTo the reset request sets (with
//    next=/reset-password), or from the home page when Supabase fell back
//    to the Site URL (no next).
//
// Either way the session cookie set here is what lets /reset-password
// call updateUser() for the right account.
const PASSWORD_FLOWS: Partial<Record<EmailOtpType, string>> = {
  recovery: "/reset-password",
  invite: "/reset-password?flow=invite",
};

function to(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const next = safeAuthNext(params.get("next"));
  const supabase = await createSupabaseServerClient();

  if (tokenHash && type && supabase) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return to(request, PASSWORD_FLOWS[type] ?? "/login?message=email_confirmed");
    if (type in PASSWORD_FLOWS) return to(request, "/forgot-password?error=link_expired");
    return to(request, "/login?error=confirmation_failed");
  }

  if (code && supabase) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      // Most often: the link was opened in a different browser from the
      // one that requested it, or it was already used.
      console.error("[auth] code exchange failed", { status: error?.status, code: error?.code });
      return to(request, "/forgot-password?error=link_expired");
    }
    if (next) return to(request, next);
    if (isRecentRecovery(data.user.recovery_sent_at)) return to(request, "/reset-password");
    return to(request, "/login?message=email_confirmed");
  }

  // Supabase reports link errors (expired, already used) as query
  // parameters on the redirect itself.
  if (params.get("error_code") === "otp_expired" || params.get("error") === "access_denied") {
    return to(request, "/forgot-password?error=link_expired");
  }
  return to(request, "/login?error=confirmation_failed");
}
