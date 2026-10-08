"use server";

// Demo-mode-only dashboard actions: the role switcher in the sidebar and
// the "Reset demo data" control on /dashboard/demo-tools. Neither has an
// equivalent in Supabase (production-pilot) mode - real sign-in and real
// pilot data respectively - so both check getDataMode() themselves rather
// than relying only on the pages that render their forms not existing in
// Supabase mode.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { DEMO_ROLE_ACCOUNTS, DEMO_ROLE_COOKIE_NAME } from "@/lib/constants";
import { resetDemoData } from "@/lib/demo-store";
import { getDataMode } from "@/lib/supabase/config";

function safeNextPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/dashboard") && !path.startsWith("//") ? path : "/dashboard";
}

// Switches which of the 6 seeded DEMO_ROLE_ACCOUNTS (constants.ts)
// getDashboardIdentity() returns, by setting the cookie it reads. Ignores
// an unrecognised role value rather than trusting arbitrary client input
// - the cookie is simply left unchanged in that case, so the identity
// falls back to whatever it already was (DEFAULT_DEMO_ROLE on first
// visit).
export async function setDemoRole(formData: FormData) {
  if (getDataMode() !== "demo") redirect("/dashboard");

  const requestedRole = String(formData.get("role") ?? "");
  const nextPath = safeNextPath(formData.get("next"));
  const account = DEMO_ROLE_ACCOUNTS.find((candidate) => candidate.role === requestedRole);
  if (account) {
    const cookieStore = await cookies();
    cookieStore.set(DEMO_ROLE_COOKIE_NAME, account.role, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  redirect(nextPath);
}

// Platform-admin-only "start over" action - see resetDemoData() in
// demo-store.ts for exactly what it resets and what it deliberately
// leaves untouched. The confirmation phrase is re-checked here, server
// side, rather than trusted from the form's client-side pattern/disabled-
// button gate alone - the same never-trust-the-client rule every other
// destructive action in this codebase already follows.
export async function resetDemoDataAction(formData: FormData) {
  if (getDataMode() !== "demo") redirect("/dashboard");

  const identity = await getDashboardIdentity();
  if (!isPlatformAdmin(identity)) redirect("/access-denied");

  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== "RESET") {
    redirect("/dashboard/demo-tools?error=confirmation");
  }

  const actorLabel = identity.displayName ?? identity.role;
  resetDemoData(actorLabel);
  redirect("/dashboard/demo-tools?reset=success");
}
