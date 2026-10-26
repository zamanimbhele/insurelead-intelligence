"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { guardPublicForm, HONEYPOT_FIELD } from "@/lib/security/public-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";
import { firstPasswordError } from "@/lib/validation/password";
import { WORKSPACE_TYPES, type WorkspaceType } from "@/lib/workspace";

function signupError(code: string): never {
  redirect(`/signup?error=${encodeURIComponent(code)}`);
}

export async function signUp(formData: FormData) {
  if (getDataMode() === "demo") signupError("configuration");

  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 120);
  const requestedType = String(formData.get("workspaceType") ?? "");
  const workspaceType: WorkspaceType | null = (WORKSPACE_TYPES as readonly string[]).includes(requestedType)
    ? (requestedType as WorkspaceType)
    : null;
  // Someone working alone may leave the name blank: their practice is
  // known by their own name.
  const enteredName = String(formData.get("brokerageName") ?? "").trim().slice(0, 160);
  const brokerageName = enteredName || (workspaceType === "individual" ? fullName : "");
  const fspNumber = String(formData.get("fspNumber") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const acceptedTerms = formData.get("acceptedTerms") === "on";

  if (!workspaceType) signupError("workspace_required");
  if (!fullName || !brokerageName || !email || !password) signupError("missing_fields");
  if (firstPasswordError({ password, confirmPassword: password })) signupError("weak_password");
  if (!acceptedTerms) signupError("terms_required");

  // Bot protection runs before Supabase sends a confirmation email.
  let guard: Awaited<ReturnType<typeof guardPublicForm>>;
  try {
    guard = await guardPublicForm({
      kind: "signup",
      headers: await headers(),
      email,
      honeypot: String(formData.get(HONEYPOT_FIELD) ?? ""),
      captchaToken: String(formData.get("captchaToken") ?? ""),
    });
  } catch (error) {
    console.error("[auth] sign-up protection unavailable", error instanceof Error ? error.message : error);
    signupError("unavailable");
  }
  // A bot that filled the hidden field is told it worked, and nothing is sent.
  if (guard === "honeypot") redirect("/signup?message=check_email");
  if (guard === "rate_limited") signupError("rate_limited");
  if (guard === "captcha_failed") signupError("verification_failed");

  const supabase = await createSupabaseServerClient();
  if (!supabase) signupError("configuration");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        brokerage_name: brokerageName,
        workspace_type: workspaceType,
        fsp_number: fspNumber || null,
        requested_role: "broker_admin",
        onboarding_status: "pending",
      },
    },
  });

  if (error) signupError(error.message.toLowerCase().includes("already") ? "account_exists" : "signup_failed");
  if (data.session) redirect("/login?message=account_created");
  redirect("/signup?message=check_email");
}
