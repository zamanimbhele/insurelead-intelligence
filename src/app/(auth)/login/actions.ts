"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";

function safeNextPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/dashboard") && !path.startsWith("//") ? path : "/dashboard";
}

export async function signIn(formData: FormData) {
  if (getDataMode() === "demo") redirect("/dashboard");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));
  const supabase = await createSupabaseServerClient();

  if (!supabase) redirect("/login?error=configuration");
  if (!email || !password) redirect(`/login?error=missing_credentials&next=${encodeURIComponent(nextPath)}`);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=invalid_credentials&next=${encodeURIComponent(nextPath)}`);
  redirect(nextPath);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
