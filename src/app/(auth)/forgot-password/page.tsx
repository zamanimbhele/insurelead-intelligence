import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requestPasswordReset } from "./actions";
import { getDataMode } from "@/lib/supabase/config";

const ERRORS: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  link_expired: "That link is invalid or has expired. Request a new one below.",
};

export const metadata = { title: "Reset your password | InsureLead Intelligence" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: errorKey } = await searchParams;
  const error = errorKey ? ERRORS[errorKey] : null;
  const demoMode = getDataMode() === "demo";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
            <p className="text-sm text-slate-500">We&apos;ll email you a link to choose a new one</p>
          </div>
        </div>

        {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {demoMode ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Password reset is unavailable while INSURELEAD_DATA_MODE is set to demo.
          </p>
        ) : (
          <form action={requestPasswordReset} className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <button type="submit" className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              Send reset link
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href="/login" className="font-semibold text-primary-700 hover:text-primary-800">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
