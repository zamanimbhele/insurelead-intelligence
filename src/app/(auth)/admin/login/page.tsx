import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { adminSignIn } from "@/app/(auth)/login/actions";
import { getDashboardIdentity } from "@/lib/auth";
import { ADMIN_HOME, isPlatformStaffRole } from "@/lib/portal";
import { getDataMode, getSupabasePublicConfig } from "@/lib/supabase/config";

const ERRORS: Record<string, string> = {
  configuration: "Supabase authentication is not configured for this environment.",
  missing_credentials: "Enter both your email address and password.",
  invalid_credentials: "The email address or password is incorrect.",
  confirmation_failed: "That link is invalid or has expired. Request a new one.",
  not_staff: "This sign-in is for InsureLead platform administrators only. Brokers sign in at /login.",
};

// Deliberately not linked from the public site or the broker sign-in.
export const metadata = { title: "Admin sign in | InsureLead Intelligence", robots: { index: false, follow: false } };

const MESSAGES: Record<string, string> = {
  reset_requested: "If that address has an InsureLead account, a password reset link is on its way. Check your inbox and spam folder.",
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const params = await searchParams;
  const demoMode = getDataMode() === "demo";
  const configured = Boolean(getSupabasePublicConfig());

  if (!demoMode && configured) {
    const identity = await getDashboardIdentity();
    if (identity.authenticated && isPlatformStaffRole(identity.role)) redirect(ADMIN_HOME);
  }
  const error = params.error ? ERRORS[params.error] : null;
  const message = params.message ? MESSAGES[params.message] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-white shadow-xl">
        <div className="bg-amber-400 px-8 py-2 text-xs font-bold uppercase tracking-wider text-slate-900">
          Platform admin
        </div>
        <div className="p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-amber-400">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Admin sign in</h1>
              <p className="text-sm text-slate-500">InsureLead platform staff only</p>
            </div>
          </div>

          {message && <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
          {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {demoMode ? (
            <div className="mt-6">
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Authentication is disabled while INSURELEAD_DATA_MODE is set to demo.
              </p>
              <Link href={ADMIN_HOME} className="mt-5 inline-flex w-full justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
                Open the synthetic admin portal
              </Link>
            </div>
          ) : configured ? (
            <form action={adminSignIn} className="mt-6 space-y-5">
              <input type="hidden" name="next" value={params.next ?? ""} />
              <label className="block text-sm font-medium text-slate-700">
                Email address
                <input name="email" type="email" autoComplete="username" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <p className="-mt-3 text-right text-sm">
                <Link href="/forgot-password?portal=admin" className="font-medium text-slate-700 hover:text-slate-900">Forgot password?</Link>
              </p>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                Sign in to the admin portal
              </button>
            </form>
          ) : (
            <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Add the Supabase URL and anonymous key to this deployment before signing in.
            </p>
          )}
          <p className="mt-6 text-xs text-slate-500">
            Actions taken in the admin portal apply across every broker on the platform.
          </p>
        </div>
      </div>
    </main>
  );
}
