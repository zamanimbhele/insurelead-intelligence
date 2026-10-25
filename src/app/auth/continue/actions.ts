"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";
import { EMAIL_LINK_TYPES, emailLinkDestination, emailLinkFailure } from "@/lib/email-links";

// Uses the one-time token from an email link. Runs only when the person
// presses the button on /auth/continue, never when a link is merely
// opened, so mail scanners cannot use the token up.
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || !(EMAIL_LINK_TYPES as readonly string[]).includes(type)) redirect("/login?error=confirmation_failed");
  if (getDataMode() === "demo") redirect(emailLinkDestination(type));

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=configuration");
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    console.error("[auth] email link verification failed", { type, status: error.status, code: error.code });
    redirect(emailLinkFailure(type));
  }
  redirect(emailLinkDestination(type));
}
