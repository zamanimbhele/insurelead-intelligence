import Link from "next/link";

export const metadata = { title: "Access denied | InsureLead Intelligence" };

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard access unavailable</h1>
        <p className="mt-3 text-sm text-slate-600">
          Your account is authenticated, but it does not have an active InsureLead profile and organisation assignment.
          Ask a platform administrator to complete your access setup.
        </p>
        <Link href="/login" className="mt-6 inline-flex rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
