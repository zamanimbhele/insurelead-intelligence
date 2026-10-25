import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { isRecentRecovery, safeAuthNext } from "@/lib/auth-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Single landing route for every Supabase email link. Two link formats
// are accepted:
//
// 1. token_hash links from the custom templates in docs/SUPABASE_SETUP.md,
//    handed to /auth/continue (see below) which verifies them on a button press:
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

  // token_hash links are NOT verified on this GET. Mail security scanners
  // (Microsoft Safe Links, Mimecast and others) open every link in an
  // email to check it, which used up the one-time token before the person
  // clicked. The link now opens /auth/continue, and the token is only used
  // when the person presses its button (a POST no scanner sends).
  if (tokenHash && type) {
    const url = new URL("/auth/continue", request.url);
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", type);
    return NextResponse.redirect(url);
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
