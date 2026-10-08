import { AlertTriangle, CheckCircle2, RotateCcw, Users } from "lucide-react";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { DEMO_ROLE_ACCOUNTS } from "@/lib/constants";
import { getDataMode } from "@/lib/supabase/config";
import { resetDemoDataAction } from "../actions";

export const metadata = { title: "Demo Tools | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function DemoToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string }>;
}) {
  const identity = await getDashboardIdentity();
  const resolvedSearchParams = await searchParams;

  if (getDataMode() !== "demo") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">Demo Tools</h1>
        <p className="mt-2 text-sm text-amber-900">
          Demo accounts and the demo data reset are not available in production-pilot mode. Real pilot data is never reset
          from the running application.
        </p>
      </div>
    );
  }

  if (!isPlatformAdmin(identity)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-slate-900">Demo Tools</h1>
        <p className="mt-2 text-sm text-amber-900">
          Demo Tools is restricted to the Super Admin demo account. Switch roles from the sidebar to try it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Demo Tools</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Synthetic demo data only - nothing here reads or writes real business or personal information. These tools exist
          so the prototype can be explored and demonstrated without a real sign-in system (see the brief&apos;s Required
          Deliverables item 13, &quot;Demo user accounts for each role&quot;, and Phase 5&apos;s &quot;Demo data reset
          process&quot;).
        </p>
      </div>

      {resolvedSearchParams.reset === "success" && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>Demo data was reset. A fresh set of synthetic leads and consent records has been generated.</p>
        </div>
      )}
      {resolvedSearchParams.error === "confirmation" && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>Reset cancelled: you must type RESET exactly to confirm.</p>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary-600" />
          <h2 className="text-lg font-semibold text-slate-900">Demo accounts, one per role</h2>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Demo mode has no real sign-in, so these 6 seeded, 100% synthetic accounts stand in for the roles the brief
          defines (section 4). Switch between them from the &quot;Viewing as&quot; control in the sidebar to see exactly
          what each role can and cannot do - the switch changes what navigation items, edit controls, and pages are
          reachable, the same role checks Supabase (production-pilot) mode enforces for real.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Demo account</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2">What they can do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DEMO_ROLE_ACCOUNTS.map((account) => (
                <tr key={account.role} className={account.role === identity.role ? "bg-primary-50/60" : undefined}>
                  <td className="py-3 pr-4 align-top font-semibold text-slate-900">
                    {account.label}
                    {account.role === identity.role && (
                      <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 align-top text-slate-700">{account.displayName}</td>
                  <td className="py-3 pr-4 align-top text-slate-500">{account.email}</td>
                  <td className="py-3 align-top text-slate-600">{account.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-primary-600" />
          <h2 className="text-lg font-semibold text-slate-900">Reset demo data</h2>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Generates a fresh set of 64 synthetic leads and matching consent records (the same generator{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">npm run seed:demo</code> uses), and clears notes,
          tasks, activity timelines, opt-out requests, data subject requests, the Data Source Registry, Financial-Year-End
          campaign plans, legal content history, application settings, and the audit log back to their defaults.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Left untouched: the separate buyer-marketplace and campaign-orchestration demo tables (lead allocations, buyers,
          campaigns, sending identities) - a different tenancy layer this reset does not cover. This control is disabled
          entirely in production-pilot mode; real pilot data is never reset from the running application.
        </p>
        <form action={resetDemoDataAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-sm font-medium text-slate-700 sm:flex-1">
            Type RESET to confirm
            <input
              name="confirmation"
              type="text"
              required
              pattern="RESET"
              title="Type RESET (uppercase) to confirm"
              placeholder="RESET"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm uppercase tracking-wide"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            <RotateCcw className="h-4 w-4" /> Reset demo data
          </button>
        </form>
      </section>
    </div>
  );
}
