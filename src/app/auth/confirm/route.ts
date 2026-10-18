import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Single landing route for every Supabase email link (see
// docs/SUPABASE_SETUP.md section 3 for the template pattern):
//   type=signup | email_change -> /login?message=email_confirmed
//   type=recovery              -> /reset-password (choose a new password)
//   type=invite                -> /reset-password?flow=invite (choose a first password)
// verifyOtp() establishes the session cookie in each case, which is what
// lets /reset-password call updateUser() for the right account.
const PASSWORD_FLOWS: Partial<Record<EmailOtpType, string>> = {
  recovery: "/reset-password",
  invite: "/reset-password?flow=invite",
};

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createSupabaseServerClient();

  if (tokenHash && type && supabase) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

    if (!error) {
      const passwordFlow = PASSWORD_FLOWS[type];
      return NextResponse.redirect(new URL(passwordFlow ?? "/login?message=email_confirmed", request.url));
    }

    if (type in PASSWORD_FLOWS) {
      return NextResponse.redirect(new URL("/forgot-password?error=link_expired", request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirmation_failed", request.url));
}
