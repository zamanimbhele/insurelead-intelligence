"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Offered to brokers and advisors without their own email domain.
export function PlatformSendingOffer({ fromName, replyTo, domain }: { fromName: string; replyTo?: string; domain: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setUp() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/sending-identities/platform", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "InsureLead sending could not be set up");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50/60 p-4" data-testid="platform-sending-offer">
      <p className="text-sm font-semibold text-slate-900">No email domain? Send through InsureLead</p>
      <p className="mt-1 text-xs text-slate-600">
        Emails go out as <span className="font-medium">&ldquo;{fromName} via InsureLead&rdquo;</span>
        {domain ? <> from <span className="font-mono">@{domain}</span></> : null}, and replies come straight to
        {" "}{replyTo ? <span className="font-medium">{replyTo}</span> : "your own email address"}. Nothing to set up.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        New senders start on lower daily limits that rise over 30 days. A sender whose emails bounce or are marked as spam
        too often is paused automatically, to protect everyone sharing the InsureLead domain.
      </p>
      <button type="button" onClick={() => void setUp()} disabled={busy || !domain} className="mt-3 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
        {busy ? "Setting up…" : domain ? "Use InsureLead sending" : "Not available yet"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
