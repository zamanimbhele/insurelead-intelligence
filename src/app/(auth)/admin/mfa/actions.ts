"use server";

// Second sign-in step for platform staff (see src/lib/staff-mfa.ts).
// Each action re-checks who is signed in and that they are staff, and is
// rate limited per person before Supabase is asked to do anything.
import { redirect } from "next/navigation";
import { ADMIN_HOME, isPlatformStaffRole, safeDashboardPath } from "@/lib/portal";
import { readOwnRole } from "@/lib/own-role";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { beginEnrolment, MFA_LIMITS, verifyCode } from "@/lib/staff-mfa";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";

export type EnrolmentState = { factorId?: string; qrCode?: string; secret?: string; error?: string };
export type VerifyState = { error?: string };

async function staffSession() {
  if (getDataMode() === "demo") redirect(ADMIN_HOME);
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login?error=configuration");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login");
  if (!isPlatformStaffRole(await readOwnRole(supabase, data.user.id))) redirect("/dashboard");
  return { supabase, userId: data.user.id };
}

async function withinLimit(key: string, limits: { windowSeconds: number; maximumRequests: number }) {
  try {
    return (await checkRateLimit(key, limits)).allowed;
  } catch (error) {
    console.error("[mfa] rate limiting unavailable", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function startEnrolment(): Promise<EnrolmentState> {
  const { supabase, userId } = await staffSession();
  if (!(await withinLimit(`admin-mfa-enrol:${userId}`, MFA_LIMITS.enrol))) {
    return { error: "Too many set-up attempts. Wait an hour and try again." };
  }
  try {
    return await beginEnrolment(supabase.auth.mfa);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The authenticator could not be set up" };
  }
}

export async function submitCode(_previous: VerifyState, formData: FormData): Promise<VerifyState> {
  const { supabase, userId } = await staffSession();
  if (!(await withinLimit(`admin-mfa-verify:${userId}`, MFA_LIMITS.verify))) {
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }
  let enrolled = false;
  try {
    ({ enrolled } = await verifyCode(supabase.auth.mfa, { factorId: formData.get("factorId"), code: formData.get("code") }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The code could not be checked" };
  }
  if (enrolled) {
    // The session is now aal2, so the admin may write their own audit entry.
    const { error } = await supabase.from("audit_logs").insert({
      entity_type: "settings",
      entity_id: userId,
      action: "admin_mfa_enrolled",
      actor_label: "admin",
      details: { message: "Authenticator app set up for platform staff sign-in" },
    });
    if (error) console.error("[mfa] enrolment audit entry failed", error.message);
  }
  redirect(safeDashboardPath(formData.get("next")) ?? ADMIN_HOME);
}
