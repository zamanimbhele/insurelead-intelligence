"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";
import { firstPasswordError } from "@/lib/validation/password";
import { acceptSupabaseProfileInvitation } from "@/lib/supabase/data";
import { homeForRole } from "@/lib/portal";

const POLICY_ERRORS = new Map<string, string>([
  ["Use at least 12 characters", "too_short"],
  ["Use at most 128 characters", "too_long"],
  ["Include letters and at least one number or symbol", "needs_mix"],
  ["Use a less repetitive password", "too_repetitive"],
  ["The two passwords do not match", "mismatch"],
]);

function back(error: string, flow: string | null): never {
  const params = new URLSearchParams({ error });
  if (flow === "invite") params.set("flow", "invite");
  redirect(`/reset-password?${params.toString()}`);
}

// Serves all three ways someone arrives at /reset-password with a session:
// a recovery link, an invitation link, or a signed-in user changing their
// password from the dashboard. The session (set by /auth/confirm's
// verifyOtp() or a normal sign-in) is what identifies the account -
// never anything submitted in this form.
export async function updatePassword(formData: FormData) {
  if (getDataMode() === "demo") redirect("/dashboard");

  const flow = formData.get("flow") === "invite" ? "invite" : null;
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const policyError = firstPasswordError({ password, confirmPassword });
  if (policyError) back(POLICY_ERRORS.get(policyError) ?? "rejected", flow);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/forgot-password?error=link_expired");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") back("same_password", flow);
    if (error.code === "weak_password") back("rejected", flow);
    console.error("[auth] password update failed", { status: error.status, code: error.code });
    back("update_failed", flow);
  }

  // No-op for anyone whose profile is not 'invited' (see
  // accept_profile_invitation() in migration 202610180001), so it is safe
  // to call for recovery and change-password flows too.
  try {
    await acceptSupabaseProfileInvitation(supabase);
  } catch (acceptError) {
    console.error("[auth] invitation acceptance failed", acceptError instanceof Error ? acceptError.message : acceptError);
  }

  // Admins land in the admin portal, brokers on their dashboard.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  redirect(homeForRole((profile as { role?: string } | null)?.role));
}
