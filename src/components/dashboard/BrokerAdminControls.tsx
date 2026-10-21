"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BrokerMember, InsuranceProduct } from "@/lib/types";
import { INSURANCE_PRODUCTS, PROVINCES } from "@/lib/constants";
import { brokerPreferencesSchema } from "@/lib/validation/brokerPreferences";

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

// Platform-admin appetite & permissions editor for one broker card on the
// Broker Directory. Collapsed by default so the directory stays readable;
// the API route (and, in Supabase mode, update_buyer_preferences()) is
// the authority - this only gives early feedback.
export function BrokerAppetiteEditor({
  organisationId,
  organisationName,
  initial,
}: {
  organisationId: string;
  organisationName: string;
  initial: {
    insuranceProducts: InsuranceProduct[];
    provinces: string[];
    minimumScore: number;
    dailyLeadCapacity: number;
    acceptsCampaigns: boolean;
    acceptsSharedLeads: boolean;
    campaignDailySendLimit: number;
    campaignMonthlySendLimit: number;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<InsuranceProduct[]>(initial.insuranceProducts);
  const [provinces, setProvinces] = useState<string[]>(initial.provinces);
  const [minimumScore, setMinimumScore] = useState(String(initial.minimumScore));
  const [dailyLeadCapacity, setDailyLeadCapacity] = useState(String(initial.dailyLeadCapacity));
  const [acceptsCampaigns, setAcceptsCampaigns] = useState(initial.acceptsCampaigns);
  const [acceptsSharedLeads, setAcceptsSharedLeads] = useState(initial.acceptsSharedLeads);
  const [campaignDailySendLimit, setCampaignDailySendLimit] = useState(String(initial.campaignDailySendLimit));
  const [campaignMonthlySendLimit, setCampaignMonthlySendLimit] = useState(String(initial.campaignMonthlySendLimit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function save() {
    setError(null);
    setNotice(null);
    const payload = {
      insuranceProducts: products,
      provinces,
      minimumScore: Number(minimumScore),
      dailyLeadCapacity: Number(dailyLeadCapacity),
      acceptsCampaigns,
      acceptsSharedLeads,
      campaignDailySendLimit: Number(campaignDailySendLimit),
      campaignMonthlySendLimit: Number(campaignMonthlySendLimit),
    };
    const parsed = brokerPreferencesSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the values and try again");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/organisations/${organisationId}/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The broker's preferences could not be updated");
      setNotice("Appetite and permissions saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The broker's preferences could not be updated");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
      >
        Edit appetite &amp; permissions
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="broker-appetite-editor">
      <p className="text-xs font-semibold text-slate-900">Appetite &amp; permissions · {organisationName}</p>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-500">Approved insurance products</legend>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {INSURANCE_PRODUCTS.map((product) => (
            <label key={product.value} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={products.includes(product.value)}
                onChange={() => setProducts((prev) => toggle(prev, product.value))}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              {product.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-500">Province coverage (none selected = national)</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PROVINCES.map((province) => (
            <label key={province} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={provinces.includes(province)}
                onChange={() => setProvinces((prev) => toggle(prev, province))}
                className="h-3 w-3 rounded border-slate-300"
              />
              {province}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Minimum lead score (0-100)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={minimumScore}
            onChange={(event) => setMinimumScore(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Daily lead capacity (1-1000)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            step={1}
            value={dailyLeadCapacity}
            onChange={(event) => setDailyLeadCapacity(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Campaign emails per day
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50000}
            step={1}
            value={campaignDailySendLimit}
            onChange={(event) => setCampaignDailySendLimit(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Campaign emails per month
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000000}
            step={1}
            value={campaignMonthlySendLimit}
            onChange={(event) => setCampaignMonthlySendLimit(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-400">Across all of this broker&apos;s campaigns, per South African calendar day and month.</p>

      <div className="mt-3 flex flex-col gap-2 text-xs text-slate-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={acceptsCampaigns} onChange={(event) => setAcceptsCampaigns(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
          Campaigns enabled
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={acceptsSharedLeads} onChange={(event) => setAcceptsSharedLeads(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
          Accepts shared leads
        </label>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          Close
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-xs text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}
