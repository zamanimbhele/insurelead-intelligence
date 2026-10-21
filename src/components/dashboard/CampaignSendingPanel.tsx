"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { CampaignQuotaStatus } from "@/lib/campaign-quota";
import type { CampaignStatus } from "@/lib/types";

// Must match SCHEDULE_CONFIRMATION in dashboard-data.ts and the API
// route's z.literal - the exact sentence the sender commits to.
const CONFIRMATION = "I confirm this campaign may be emailed to its eligible audience";

function sastNowLocalInput() {
  // datetime-local wants "YYYY-MM-DDTHH:mm"; the form is in SAST (UTC+2).
  return new Date(Date.now() + 120 * 60_000).toISOString().slice(0, 16);
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium text-slate-800">{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={`${label}: ${used} of ${limit} sent`}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className={`h-full rounded-full ${percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-primary-600"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function CampaignSendingPanel({
  campaignId,
  status,
  scheduledAtLabel,
  eligibleCount,
  sentCount,
  queuedCount,
  quota,
  canControl,
  blockedReason,
  approvalCurrent,
}: {
  campaignId: string;
  status: CampaignStatus;
  scheduledAtLabel?: string;
  eligibleCount: number;
  sentCount: number;
  queuedCount: number;
  quota: CampaignQuotaStatus;
  canControl: boolean;
  blockedReason?: string;
  approvalCurrent: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"now" | "later">("later");
  const [sendAt, setSendAt] = useState(sastNowLocalInput());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/schedule`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST"
          ? JSON.stringify({ sendAt: mode === "now" ? "now" : sendAt, confirmation: CONFIRMATION })
          : undefined,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The request could not be completed");
      setConfirmed(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request could not be completed");
    } finally {
      setBusy(false);
    }
  }

  const canSchedule = canControl && ["approved", "paused"].includes(status) && approvalCurrent && !blockedReason;
  const willSendNow = Math.min(eligibleCount, quota.remaining);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="campaign-sending-panel">
      <h2 className="text-sm font-semibold text-slate-900">Sending</h2>

      <div className="mt-3 flex flex-col gap-3">
        <UsageBar label="Broker emails today" used={quota.sentToday} limit={quota.dailyLimit} />
        <UsageBar label="Broker emails this month" used={quota.sentThisMonth} limit={quota.monthlyLimit} />
        <p className="text-xs text-slate-400">Limits apply across all of this broker&apos;s campaigns, per South African day and month.</p>
      </div>

      {(sentCount > 0 || queuedCount > 0) && (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
          <div><dt className="text-xs text-slate-400">Sent</dt><dd className="mt-0.5 font-semibold text-slate-800">{sentCount}</dd></div>
          <div><dt className="text-xs text-slate-400">Waiting to send</dt><dd className="mt-0.5 font-semibold text-slate-800">{queuedCount}</dd></div>
        </dl>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 text-sm" data-testid="campaign-sending-state">
        {status === "scheduled" && (
          <p className="text-slate-700">Scheduled for <span className="font-semibold">{scheduledAtLabel}</span>. It sends in batches within the limits above.</p>
        )}
        {status === "sending" && (
          <p className="text-slate-700">
            Sending in batches every few minutes.
            {quota.remaining === 0 && " The broker's limit is reached; sending continues when it resets."}
          </p>
        )}
        {status === "paused" && <p className="text-amber-700">Paused. Check the activity log for the reason, then schedule again to resume.</p>}
        {status === "completed" && <p className="text-emerald-700">All queued recipients have been processed.</p>}
        {["draft", "pending_review"].includes(status) && <p className="text-slate-500">Approve the campaign before it can be scheduled.</p>}

        {canControl && ["scheduled", "sending"].includes(status) && (
          <button
            type="button"
            onClick={() => void call("DELETE")}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {status === "scheduled" ? "Cancel schedule" : "Pause sending"}
          </button>
        )}

        {canControl && ["approved", "paused"].includes(status) && !canSchedule && (
          <p className="mt-2 text-xs text-amber-700" data-testid="campaign-schedule-blocked">
            {!approvalCurrent
              ? "The content changed after approval. Approve the current version before scheduling."
              : blockedReason}
          </p>
        )}

        {canSchedule && (
          <div className="mt-2 flex flex-col gap-3" data-testid="campaign-schedule-form">
            <fieldset className="flex flex-col gap-1.5 text-xs text-slate-700">
              <legend className="sr-only">When to send</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="send-mode" checked={mode === "now"} onChange={() => setMode("now")} />
                Start sending now
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="send-mode" checked={mode === "later"} onChange={() => setMode("later")} />
                Schedule for
              </label>
            </fieldset>
            {mode === "later" && (
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                Send date and time (SAST)
                <input
                  type="datetime-local"
                  value={sendAt}
                  min={sastNowLocalInput()}
                  onChange={(event) => setSendAt(event.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                />
              </label>
            )}
            <p className="text-xs text-slate-500">
              {eligibleCount} eligible recipient{eligibleCount === 1 ? "" : "s"}.
              {willSendNow < eligibleCount && ` About ${willSendNow} fit within today's remaining limit; the rest follow as the limits reset.`}
            </p>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-3.5 w-3.5" />
              <span>&ldquo;{CONFIRMATION}&rdquo;</span>
            </label>
            <button
              type="button"
              onClick={() => void call("POST")}
              disabled={busy || !confirmed}
              className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {status === "paused" ? "Resume sending" : mode === "now" ? "Start sending" : "Schedule send"}
            </button>
          </div>
        )}
        {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
