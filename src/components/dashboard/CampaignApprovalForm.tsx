"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// The exact human sign-off the whole campaign pipeline is gated on,
// mirroring the MCP server's approve_campaign tool. The attestation
// string sent to /api/campaigns/[id]/approve is a hardcoded literal
// matching both the API route's z.literal and the Supabase RPC's own
// exact-string check - it is never built from the checkbox alone, so a
// future UI change to the checkbox label can't silently change what is
// actually attested to.
const ATTESTATION = "I approve this campaign for delivery";

export function CampaignApprovalForm({
  campaignId,
  blocked,
  blockedReason,
}: {
  campaignId: string;
  blocked: boolean;
  blockedReason?: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attestation: ATTESTATION }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The campaign could not be approved");
      setNotice("Approved. Use the MCP tools to send a test message, then explicitly launch delivery to the eligible audience.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The campaign could not be approved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4" data-testid="campaign-approval-form">
      <h3 className="text-sm font-semibold text-slate-900">Approve for delivery</h3>
      <p className="mt-1 text-xs text-slate-500">
        This is the one explicit human sign-off the pipeline requires before a launch can even be requested. It never schedules or
        sends anything itself.
      </p>
      {blocked ? (
        <p className="mt-3 text-xs text-amber-700" data-testid="campaign-approval-blocked">
          {blockedReason ?? "Resolve the validation issues above before this campaign can be approved."}
        </p>
      ) : (
        <>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-primary-600"
            />
            <span>&ldquo;{ATTESTATION}&rdquo;</span>
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !checked}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Approve campaign
          </button>
        </>
      )}
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-xs text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}
