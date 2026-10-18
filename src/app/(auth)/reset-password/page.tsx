import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { updatePassword } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/supabase/config";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/password";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: "Use at most 128 characters.",
  needs_mix: "Include letters and at least one number or symbol.",
  too_repetitive: "Use a less repetitive password.",
  mismatch: "The two passwords do not match.",
  same_password: "Choose a password you haven't used for this account before.",
  rejected: "That password was rejected. Choose a longer or less common one.",
  update_failed: "Your password could not be updated. Try again, or request a new link.",
};

export const metadata = { title: "Choose a password | InsureLead Intelligence" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; flow?: string }> }) {
  const { error: errorKey, flow } = await searchParams;
  const error = errorKey ? ERRORS[errorKey] ?? ERRORS.update_failed : null;
  const invite = flow === "invite";
  const demoMode = getDataMode() === "demo";

  const supabase = demoMode ? null : await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const email = data.user?.email;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{invite ? "Welcome to InsureLead" : "Choose a new password"}</h1>
            <p className="text-sm text-slate-500">
              {invite ? "Set a password to finish joining your team" : "Your new password replaces the old one immediately"}
            </p>
          </div>
        </div>

        {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {demoMode ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Passwords are unavailable while INSURELEAD_DATA_MODE is set to demo.
          </p>
        ) : !email ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This link is invalid or has expired, or you are not signed in.
            </p>
            <Link href="/forgot-password" className="inline-flex w-full justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              Request a new link
            </Link>
          </div>
        ) : (
          <form action={updatePassword} className="mt-6 space-y-5">
            <input type="hidden" name="flow" value={invite ? "invite" : ""} />
            {/* Lets password managers associate the new password with the right account. */}
            <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
            <p className="text-sm text-slate-600">Signed in as <span className="font-medium text-slate-900">{email}</span></p>
            <label className="block text-sm font-medium text-slate-700">
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={128}
                aria-describedby="password-help"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <p id="password-help" className="-mt-3 text-xs text-slate-500">
              At least {PASSWORD_MIN_LENGTH} characters, with letters and a number or symbol. A short phrase works well.
            </p>
            <label className="block text-sm font-medium text-slate-700">
              Confirm new password
              <input name="confirmPassword" type="password" autoComplete="new-password" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <button type="submit" className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              {invite ? "Set password and continue" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
