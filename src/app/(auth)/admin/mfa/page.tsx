import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { currentAssuranceLevel, readOwnRole } from "@/lib/own-role";
import { ADMIN_HOME, isPlatformStaffRole, safeDashboardPath } from "@/lib/portal";
import { verifiedTotpFactor } from "@/lib/staff-mfa";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";
import { MfaForm } from "./MfaForm";

export const metadata = { title: "Admin verification | InsureLead Intelligence", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Second sign-in step for platform staff: set up an authenticator app the
// first time, then enter its code at every sign-in.
export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeDashboardPath(params.next) ?? ADMIN_HOME;
  if (getDataMode() === "demo") redirect(next);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/admin/login?error=configuration");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login");
  if (!isPlatformStaffRole(await readOwnRole(supabase, data.user.id))) redirect("/dashboard");
  if ((await currentAssuranceLevel(supabase)) === "aal2") redirect(next);

  const factor = await verifiedTotpFactor(supabase.auth.mfa);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-white shadow-xl">
        <div className="bg-amber-400 px-8 py-2 text-xs font-bold uppercase tracking-wider text-slate-900">Platform admin</div>
        <div className="p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-amber-400">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{factor ? "Enter your code" : "Set up two-step sign-in"}</h1>
              <p className="text-sm text-slate-500">{data.user.email}</p>
            </div>
          </div>
          <MfaForm mode={factor ? "challenge" : "enrol"} factorId={factor?.id} next={next} />
          <form action={signOut} className="mt-6 text-center">
            <button type="submit" className="text-sm font-medium text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
          <p className="mt-4 text-xs text-slate-400">
            Lost your phone? Ask another InsureLead administrator to reset your authenticator in Supabase.
          </p>
        </div>
      </div>
    </main>
  );
}
