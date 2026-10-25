import { MailCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { confirmEmailLink } from "./actions";
import { emailLinkCopy, isEmailLinkType } from "@/lib/email-links";

export const dynamic = "force-dynamic";
export const metadata = { title: "Continue | InsureLead Intelligence", robots: { index: false, follow: false } };

// Landing page for email links. Opening it uses nothing up; the button
// does (see actions.ts for why).
export default async function ContinueEmailLinkPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash: tokenHash, type } = await searchParams;
  if (!tokenHash || !isEmailLinkType(type)) redirect("/login?error=confirmation_failed");
  const copy = emailLinkCopy(type);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <MailCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{copy.title}</h1>
            <p className="text-sm text-slate-500">InsureLead Intelligence</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-slate-600">{copy.body}</p>
        <form action={confirmEmailLink} className="mt-6">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <button type="submit" className="w-full rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
            {copy.button}
          </button>
        </form>
      </div>
    </main>
  );
}
