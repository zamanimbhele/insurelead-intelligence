import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { signUp } from "./actions";
import { getDataMode, getSupabasePublicConfig } from "@/lib/supabase/config";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/password";
import { SIGNUP_CHOICES } from "@/lib/workspace";
import { FormSecurityFields } from "@/components/forms/FormSecurityFields";
import { safeCaptchaSiteKey } from "@/lib/security/captcha";

const ERRORS: Record<string, string> = {
  configuration: "Broker registration is not configured for this environment.",
  workspace_required: "Tell us whether you work on your own, in a practice, or in a brokerage.",
  missing_fields: "Complete all required fields. A practice or brokerage needs a name.",
  weak_password: `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters, with letters and a number or symbol.`,
  terms_required: "Accept the Terms and Privacy Notice to continue.",
  account_exists: "An account already exists for this email address. Try signing in instead.",
  signup_failed: "We could not create your account. Please try again or contact the platform team.",
  rate_limited: "Too many sign-up attempts. Please wait a while and try again.",
  verification_failed: "Security verification failed. Please complete the check and try again.",
  unavailable: "Sign-up is temporarily unavailable. Please try again shortly.",
};

export const metadata = { title: "Create your account | InsureLead Intelligence" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  const configured = getDataMode() === "supabase" && Boolean(getSupabasePublicConfig());
  const error = params.error ? ERRORS[params.error] : null;
  const checkEmail = params.message === "check_email";
  const turnstileSiteKey = safeCaptchaSiteKey();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
            <p className="text-sm text-slate-500">For independent advisors, practices and brokerages</p>
          </div>
        </div>

        <div className="mt-6 flex gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Every account is reviewed before campaigns or leads become available. Registering does not approve you automatically.</p>
        </div>

        {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {checkEmail && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Check your email to confirm your account. The InsureLead team will review your broker details before enabling dashboard access.
          </div>
        )}

        {!checkEmail && configured ? (
          <form action={signUp} className="mt-6 space-y-4">
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">How do you work?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {SIGNUP_CHOICES.map((choice) => (
                  <label key={choice.value} className="flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-300 p-3 text-sm has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50">
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                      <input type="radio" name="workspaceType" value={choice.value} required className="h-4 w-4 text-primary-600" />
                      {choice.title}
                    </span>
                    <span className="text-xs text-slate-500">{choice.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-medium text-slate-700">
              Your full name
              <input name="fullName" autoComplete="name" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Trading, practice or brokerage name
              <span className="block text-xs font-normal text-slate-500">Working on your own? Leave this blank to use your name.</span>
              <input name="brokerageName" autoComplete="organization" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              FSP number <span className="font-normal text-slate-500">(yours, or the FSP you represent; optional for now)</span>
              <input name="fspNumber" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Work email address
              <input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={128} required aria-describedby="signup-password-help" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
              <span id="signup-password-help" className="mt-1 block text-xs font-normal text-slate-500">At least {PASSWORD_MIN_LENGTH} characters, with letters and a number or symbol.</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <input name="acceptedTerms" type="checkbox" required className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600" />
              <span>
                I agree to the <Link href="/terms" className="font-medium text-primary-700">Terms</Link> and acknowledge the <Link href="/privacy" className="font-medium text-primary-700">Privacy Notice</Link>.
              </span>
            </label>
            <FormSecurityFields siteKey={turnstileSiteKey} action="account_signup" />
            <button type="submit" className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              Create account
            </button>
          </form>
        ) : !checkEmail ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Broker registration will be available when Supabase authentication is enabled for this deployment.
          </p>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          Already registered? <Link href="/login" className="font-semibold text-primary-700 hover:text-primary-800">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
