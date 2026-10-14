"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Generates a new, versioned campaign content version from a plain-
// language key message and call-to-action, mirroring the MCP server's
// generate_campaign_content tool. Never approves or sends anything -
// every new version resets any prior approval on the campaign (see
// save_campaign_content_version in 202609110002_campaign_generation_mcp.sql),
// which is why re-generating after an approval visibly moves the
// campaign back to requiring a fresh sign-off.
export function CampaignContentForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [keyMessage, setKeyMessage] = useState("");
  const [callToActionLabel, setCallToActionLabel] = useState("");
  const [callToActionUrl, setCallToActionUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    if (keyMessage.trim().length < 10) {
      setError("The key message needs at least 10 characters");
      return;
    }
    if (!callToActionLabel.trim()) {
      setError("A call-to-action label is required");
      return;
    }
    if (!callToActionUrl.trim().startsWith("https://")) {
      setError("The call-to-action link must start with https://");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyMessage: keyMessage.trim(),
          callToActionLabel: callToActionLabel.trim(),
          callToActionUrl: callToActionUrl.trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The content could not be generated");
      setNotice(`Content version ${body.content?.version ?? ""} generated. Review the preview below, then request approval.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The content could not be generated");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4" data-testid="campaign-content-form">
      <h3 className="text-sm font-semibold text-slate-900">Generate campaign content</h3>
      <p className="mt-1 text-xs text-slate-500">
        Describe the message in plain language. The subject, preheader, and both HTML and text bodies are generated and versioned
        automatically, including the required unsubscribe link - this never sends anything.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Key message
          <textarea
            value={keyMessage}
            onChange={(event) => setKeyMessage(event.target.value)}
            rows={3}
            placeholder="What should this email say, in your own words?"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Call-to-action label
            <input
              value={callToActionLabel}
              onChange={(event) => setCallToActionLabel(event.target.value)}
              placeholder="e.g. Request a review"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Call-to-action link (https only)
            <input
              value={callToActionUrl}
              onChange={(event) => setCallToActionUrl(event.target.value)}
              placeholder="https://..."
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Generate content
      </button>
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-xs text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}
