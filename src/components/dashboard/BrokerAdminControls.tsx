"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BrokerMember } from "@/lib/types";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "broker_admin", label: "Broker Admin" },
  { value: "broker_agent", label: "Broker Agent" },
  { value: "campaign_manager", label: "Campaign Manager" },
  { value: "platform_admin", label: "Platform Admin" },
  { value: "compliance_admin", label: "Compliance Admin" },
  { value: "compliance_auditor", label: "Compliance Auditor" },
];

const STATUS_OPTIONS: { value: BrokerMember["status"]; label: string }[] = [
  { value: "invited", label: "Invited" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

// A pending/in-review organisation's sign-up (see handle_new_user() in
// 202610100001_platform_admin_onboarding.sql) - approve activates the
// tenant, reject leaves it inactive. Platform-admin only; the API route
// re-checks this server-side regardless of what renders here.
export function OrganisationReviewControls({ organisationId }: { organisationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: "approve" | "reject") {
    setBusy(decision);
    setError(null);
    const response = await fetch(`/api/admin/organisations/${organisationId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "The organisation could not be reviewed");
      setBusy(null);
      return;
    }
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-medium text-amber-900">This organisation is awaiting approval.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void review("approve")}
          disabled={busy !== null}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => void review("reject")}
          disabled={busy !== null}
          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Role and membership-status controls for one organisation's roster. Read-
// only badges are shown to non-admins (compliance auditors); the select
// controls themselves only render for a platform admin, and the API route
// re-checks that server-side too - this is a convenience gate, not the
// real one.
export function MemberMembershipControls({ member, canEdit }: { member: BrokerMember; canEdit: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-700">{member.displayName ?? "Unnamed member"}</span>
        <span className="text-xs text-slate-500">
          {ROLE_OPTIONS.find((option) => option.value === member.role)?.label ?? member.role} · {member.status}
        </span>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/admin/profiles/${member.id}/membership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, memberStatus: status }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "The member could not be updated");
      setSaving(false);
      return;
    }
    router.refresh();
    setSaving(false);
  }

  const changed = role !== member.role || status !== member.status;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700">{member.displayName ?? "Unnamed member"}</span>
        {member.jobTitle && <span className="text-xs text-slate-400">{member.jobTitle}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as BrokerMember["role"])}
            disabled={saving}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as BrokerMember["status"])}
            disabled={saving}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {changed && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="self-end rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Sending-domain verification (brief section 14's "Add a platform
// administration UI for ... sending-domain verification"). This is a
// manual admin attestation - "we checked the DNS records and they match" -
// not an automated DNS/Resend API check, consistent with how CSV import
// gating and other data-governance decisions elsewhere in this app are
// deliberate human review steps, not automation.
export function SendingIdentityReviewControls({ identityId, status }: { identityId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"verified" | "disabled" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(nextStatus: "verified" | "disabled") {
    setBusy(nextStatus);
    setError(null);
    const response = await fetch(`/api/admin/sending-identities/${identityId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "The sending identity could not be reviewed");
      setBusy(null);
      return;
    }
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        {status !== "verified" && (
          <button
            type="button"
            onClick={() => void review("verified")}
            disabled={busy !== null}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {busy === "verified" ? "Marking…" : "Mark verified"}
          </button>
        )}
        {status !== "disabled" && (
          <button
            type="button"
            onClick={() => void review("disabled")}
            disabled={busy !== null}
            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === "disabled" ? "Disabling…" : "Disable"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
