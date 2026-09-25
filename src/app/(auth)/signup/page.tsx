import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { signUp } from "./actions";
import { getDataMode, getSupabasePublicConfig } from "@/lib/supabase/config";

const ERRORS: Record<string, string> = {
  configuration: "Broker registration is not configured for this environment.",
  missing_fields: "Complete all required fields.",
  weak_password: "Choose a password with at least eight characters.",
  terms_required: "Accept the Terms and Privacy Notice to continue.",
  account_exists: "An account already exists for this email address. Try signing in instead.",
  signup_failed: "We could not create your account. Please try again or contact the platform team.",
};

export const metadata = { title: "Create broker account | InsureLead Intelligence" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  const configured = getDataMode() === "supabase" && Boolean(getSupabasePublicConfig());
  const error = params.error ? ERRORS[params.error] : null;
  const checkEmail = params.message === "check_email";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Create a broker account</h1>
            <p className="text-sm text-slate-500">Request access to the InsureLead campaign and lead workspace</p>
          </div>
        </div>

        <div className="mt-6 flex gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Broker accounts are reviewed before campaigns or leads become available. Registration does not automatically approve your brokerage.</p>
        </div>

        {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {checkEmail && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Check your email to confirm your account. The InsureLead team will review your broker details before enabling dashboard access.
          </div>
        )}

        {!checkEmail && configured ? (
          <form action={signUp} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Full name
              <input name="fullName" autoComplete="name" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Brokerage or company name
              <input name="brokerageName" autoComplete="organization" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              FSP number <span className="font-normal text-slate-500">(optional during registration)</span>
              <input name="fspNumber" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Work email address
              <input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input name="password" type="password" autoComplete="new-password" minLength={8} required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <input name="acceptedTerms" type="checkbox" required className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600" />
              <span>
                I agree to the <Link href="/terms" className="font-medium text-primary-700">Terms</Link> and acknowledge the <Link href="/privacy" className="font-medium text-primary-700">Privacy Notice</Link>.
              </span>
            </label>
            <button type="submit" className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              Create broker account
            </button>
          </form>
        ) : !checkEmail ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Broker registration will be available when Supabase authentication is enabled for this deployment.
          </p>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          Already registered? <Link href="/login" className="font-semibold text-primary-700 hover:text-primary-800">Broker login</Link>
        </p>
      </div>
    </main>
  );
}
