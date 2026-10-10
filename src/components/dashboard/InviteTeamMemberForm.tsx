"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const ROLE_OPTIONS: { value: "broker_admin" | "campaign_manager" | "broker_agent"; label: string }[] = [
  { value: "broker_agent", label: "Broker" },
  { value: "campaign_manager", label: "Marketing Analyst" },
  { value: "broker_admin", label: "Broker Manager" },
];

// Broker self-service "invite a team member" form, shown on
// /dashboard/broker-profile to a broker_admin only
// (canInviteTeamMember() in auth.ts). Posts to /api/broker-team/invite,
// which creates a real Supabase auth user via the Admin API and sends
// Supabase's own invite email, then attaches it to this organisation as
// an 'invited' profile - never a second, duplicate organisation, which
// is what plain self-signup would have produced for a second team
// member.
export function InviteTeamMemberForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"broker_admin" | "campaign_manager" | "broker_agent">("broker_agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) {
      setError("An email address is required");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/broker-team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role, displayName: displayName.trim() || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The invitation could not be sent");
      setEmail("");
      setDisplayName("");
      setRole("broker_agent");
      setNotice("Invitation sent. They'll appear below as invited once you refresh, and can sign in once they accept.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The invitation could not be sent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4" data-testid="invite-team-member-form">
      <h3 className="text-sm font-semibold text-slate-900">Invite a team member</h3>
      <p className="mt-1 text-xs text-slate-500">
        Sends an invitation email and adds them to this organisation directly - not a second, separate signup.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Email address
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="e.g. colleague@example.co.za"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Full name (optional)
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Lindiwe Zulu"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 sm:col-span-2">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Send invitation
      </button>
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-xs text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}
