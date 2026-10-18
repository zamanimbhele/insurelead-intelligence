"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

// Always lands on the same "check your inbox" message whether or not the
// address has an account, so this form cannot be used to discover which
// emails are registered. Supabase rate-limits recovery emails per address
// and per project on its side.
export async function requestPasswordReset(formData: FormData) {
  if (getDataMode() === "demo") redirect("/login");

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) redirect("/forgot-password?error=invalid_email");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=configuration");

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data);
  if (error && error.status !== 429) {
    console.error("[auth] password reset request failed", { status: error.status, code: error.code });
  }
  redirect("/login?message=reset_requested");
}
