import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { signIn } from "./actions";
import { getDataMode, getSupabasePublicConfig } from "@/lib/supabase/config";

const ERRORS: Record<string, string> = {
  configuration: "Supabase authentication is not configured for this environment.",
  missing_credentials: "Enter both your email address and password.",
  invalid_credentials: "The email address or password is incorrect.",
};

export const metadata = { title: "Sign in | InsureLead Intelligence" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const demoMode = getDataMode() === "demo";
  const configured = Boolean(getSupabasePublicConfig());
  const error = resolvedSearchParams.error ? ERRORS[resolvedSearchParams.error] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">InsureLead sign in</h1>
            <p className="text-sm text-slate-500">Protected broker and marketplace workspace</p>
          </div>
        </div>

        {error && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {demoMode ? (
          <div className="mt-6">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Authentication is disabled while INSURELEAD_DATA_MODE is set to demo.
            </p>
            <Link href="/dashboard" className="mt-5 inline-flex w-full justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white">
              Open synthetic demo dashboard
            </Link>
          </div>
        ) : configured ? (
          <form action={signIn} className="mt-6 space-y-5">
            <input type="hidden" name="next" value={resolvedSearchParams.next ?? "/dashboard"} />
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <button type="submit" className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              Sign in
            </button>
          </form>
        ) : (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Add the Supabase URL and anonymous key to this deployment before signing in.
          </p>
        )}
      </div>
    </main>
  );
}
