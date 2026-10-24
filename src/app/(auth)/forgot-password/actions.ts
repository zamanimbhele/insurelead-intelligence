"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AUTH_CONFIRM_PATH, appOrigin } from "@/lib/auth-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

// Always lands on the same "check your inbox" message whether or not the
// address has an account, so this form cannot be used to discover which
// emails are registered. Supabase rate-limits recovery emails per address
// and per project on its side.
export async function requestPasswordReset(formData: FormData) {
  const admin = formData.get("portal") === "admin";
  const signInPath = admin ? "/admin/login" : "/login";
  const formPath = admin ? "/forgot-password?portal=admin&" : "/forgot-password?";
  if (getDataMode() === "demo") redirect(signInPath);

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) redirect(`${formPath}error=invalid_email`);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(`${signInPath}?error=configuration`);

  // Tells Supabase where the default "{{ .ConfirmationURL }}" email link
  // should land: /auth/confirm, which opens the password form. Without
  // it the link falls back to the Site URL (the home page) and the reset
  // never reaches the form. The custom token_hash template described in
  // docs/SUPABASE_SETUP.md also works and does not need this.
  const requestHeaders = await headers();
  const origin = appOrigin(
    process.env.NEXT_PUBLIC_APP_URL,
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
  );
  const redirectTo = origin ? `${origin}${AUTH_CONFIRM_PATH}?next=${encodeURIComponent("/reset-password")}` : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, redirectTo ? { redirectTo } : undefined);
  if (error && error.status !== 429) {
    console.error("[auth] password reset request failed", { status: error.status, code: error.code });
  }
  redirect(`${signInPath}?message=reset_requested`);
}
