"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";

function signupError(code: string): never {
  redirect(`/signup?error=${encodeURIComponent(code)}`);
}

export async function signUp(formData: FormData) {
  if (getDataMode() === "demo") signupError("configuration");

  const fullName = String(formData.get("fullName") ?? "").trim();
  const brokerageName = String(formData.get("brokerageName") ?? "").trim();
  const fspNumber = String(formData.get("fspNumber") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const acceptedTerms = formData.get("acceptedTerms") === "on";

  if (!fullName || !brokerageName || !email || !password) signupError("missing_fields");
  if (password.length < 8) signupError("weak_password");
  if (!acceptedTerms) signupError("terms_required");

  const supabase = await createSupabaseServerClient();
  if (!supabase) signupError("configuration");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        brokerage_name: brokerageName,
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
