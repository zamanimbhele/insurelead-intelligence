"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { allowSignInAttempt, type SignInScope } from "@/lib/security/sign-in-limits";
import { readOwnRole } from "@/lib/own-role";
import { MFA_PAGE } from "@/lib/staff-mfa";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";
import { ADMIN_HOME, homeForRole, isPlatformStaffRole, safeDashboardPath } from "@/lib/portal";

type ServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// Falls back to the server key while a staff session still needs its
// second factor (the database refuses it until then).
async function signedInRole(supabase: ServerClient, userId: string): Promise<string | null> {
  return readOwnRole(supabase, userId);
}

// Platform staff always go through the authenticator step next.
function mfaStep(requested: string | null): never {
  redirect(`${MFA_PAGE}${requested ? `?next=${encodeURIComponent(requested)}` : ""}`);
}

// Rate limits run before the password is checked (see sign-in-limits.ts).
// Returns an error code for the sign-in page, or null to go ahead.
async function signInLimitError(scope: SignInScope, email: string): Promise<string | null> {
  try {
    return (await allowSignInAttempt({ scope, headers: await headers(), email })) ? null : "rate_limited";
  } catch (error) {
    console.error("[auth] sign-in rate limiting unavailable", error instanceof Error ? error.message : error);
    return "unavailable";
  }
}

// Broker sign-in (/login). Platform staff who sign in here are still let
// in, but land in the admin portal rather than a broker dashboard.
export async function signIn(formData: FormData) {
  if (getDataMode() === "demo") redirect("/dashboard");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requested = safeDashboardPath(formData.get("next"));
  const nextParam = requested ? `&next=${encodeURIComponent(requested)}` : "";
  const supabase = await createSupabaseServerClient();

  if (!supabase) redirect("/login?error=configuration");
  if (!email || !password) redirect(`/login?error=missing_credentials${nextParam}`);
  const limited = await signInLimitError("broker", email);
  if (limited) redirect(`/login?error=${limited}${nextParam}`);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/login?error=invalid_credentials${nextParam}`);

  const role = await signedInRole(supabase, data.user.id);
  if (isPlatformStaffRole(role)) mfaStep(requested && requested !== "/dashboard" ? requested : null);
  redirect(requested ?? homeForRole(role));
}

// Admin sign-in (/admin/login). Only platform staff get through; a broker
// account is signed straight back out with a pointer to /login, so the
// admin page can never become a second way into a broker workspace.
export async function adminSignIn(formData: FormData) {
  if (getDataMode() === "demo") redirect(ADMIN_HOME);

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requested = safeDashboardPath(formData.get("next"));
  const nextParam = requested ? `&next=${encodeURIComponent(requested)}` : "";
  const supabase = await createSupabaseServerClient();

  if (!supabase) redirect("/admin/login?error=configuration");
  if (!email || !password) redirect(`/admin/login?error=missing_credentials${nextParam}`);
  const limited = await signInLimitError("admin", email);
  if (limited) redirect(`/admin/login?error=${limited}${nextParam}`);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/admin/login?error=invalid_credentials${nextParam}`);

  const role = await signedInRole(supabase, data.user.id);
  if (!isPlatformStaffRole(role)) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_staff");
  }
  mfaStep(requested && requested !== "/dashboard" ? requested : null);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  let destination = "/login";
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user && isPlatformStaffRole(await signedInRole(supabase, data.user.id))) destination = "/admin/login";
    await supabase.auth.signOut();
  }
  redirect(destination);
}
