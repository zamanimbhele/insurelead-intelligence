"use client";

import { useActionState } from "react";
import { startEnrolment, submitCode, type EnrolmentState, type VerifyState } from "./actions";

function CodeForm({ factorId, next }: { factorId: string; next: string }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(submitCode, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-slate-700">
        6-digit code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.4em]"
          data-testid="mfa-code"
        />
      </label>
      {state.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Checking..." : "Verify"}
      </button>
    </form>
  );
}

export function MfaForm({ mode, factorId, next }: { mode: "enrol" | "challenge"; factorId?: string; next: string }) {
  const [enrolment, enrol, enrolling] = useActionState<EnrolmentState>(startEnrolment, {});

  if (mode === "challenge" && factorId) {
    return (
      <>
        <p className="mt-6 text-sm text-slate-600">Open your authenticator app and enter the current code for InsureLead.</p>
        <CodeForm factorId={factorId} next={next} />
      </>
    );
  }

  if (!enrolment.factorId) {
    return (
      <form action={enrol} className="mt-6 space-y-4">
        <p className="text-sm text-slate-600">
          Admin accounts need a second sign-in step. You will need an authenticator app on your phone, such as
          Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        {enrolment.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{enrolment.error}</p>}
        <button type="submit" disabled={enrolling} className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {enrolling ? "Preparing..." : "Set up authenticator app"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-6">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>In your authenticator app, add an account and scan this code.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR code as an SVG data URL */}
      <img src={enrolment.qrCode} alt="QR code for your authenticator app" className="mx-auto mt-4 h-48 w-48" />
      <p className="mt-3 text-center text-xs text-slate-500">
        Can&apos;t scan it? Enter this key instead: <code className="break-all font-mono text-slate-800">{enrolment.secret}</code>
      </p>
      <CodeForm factorId={enrolment.factorId} next={next} />
    </div>
  );
}
