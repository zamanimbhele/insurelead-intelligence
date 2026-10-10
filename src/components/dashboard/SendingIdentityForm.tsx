"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Broker self-service "add a sending identity" form, shown on
// /dashboard/broker-profile to a broker_admin or campaign_manager
// (canCreateSendingIdentity() in auth.ts - see that function's comment
// for why platform admins are deliberately excluded here). Posts to
// /api/sending-identities, which always creates the identity 'pending' -
// a platform admin still has to verify it via the separate review
// action on /dashboard/brokers before campaigns can actually send from
// it (BrokerAdminControls.tsx's SendingIdentityReviewControls).
export function SendingIdentityForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    if (!domain.trim() || !fromName.trim() || !fromEmail.trim()) {
      setError("A domain, from-name, and from-email are required");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/sending-identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
          replyToEmail: replyToEmail.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The sending identity could not be added");
      setDomain("");
      setFromName("");
      setFromEmail("");
      setReplyToEmail("");
      setNotice("Added. A platform administrator still needs to verify this identity before campaigns can send from it.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sending identity could not be added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4" data-testid="sending-identity-form">
      <h3 className="text-sm font-semibold text-slate-900">Add a sending identity</h3>
      <p className="mt-1 text-xs text-slate-500">
        Added as pending. A platform administrator must verify it before it can be used for campaign delivery.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Sending domain
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="e.g. mail.example.co.za"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          From name
          <input
            value={fromName}
            onChange={(event) => setFromName(event.target.value)}
            placeholder="e.g. Acme Insurance Brokers"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          From email
          <input
            value={fromEmail}
            onChange={(event) => setFromEmail(event.target.value)}
            placeholder="e.g. consultations@mail.example.co.za"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Reply-to email (optional)
          <input
            value={replyToEmail}
            onChange={(event) => setReplyToEmail(event.target.value)}
            placeholder="e.g. support@example.co.za"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Add sending identity
      </button>
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-xs text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}
