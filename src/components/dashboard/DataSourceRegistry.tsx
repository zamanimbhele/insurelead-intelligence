"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import type { DataSource, DataSourceApprovalDecision } from "@/lib/types";
import {
  DATA_QUALITY_RATINGS,
  DATA_SOURCE_APPROVAL_STATUS_LABELS,
  DATA_SOURCE_CATEGORIES,
  DATA_SOURCE_CONSENT_STATUSES,
  DATA_SOURCE_REFRESH_FREQUENCIES,
} from "@/lib/constants";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed");
  return result as T;
}

function fieldLabel(className = "") {
  return `flex flex-col gap-1 text-xs font-medium text-slate-500 ${className}`;
}

const inputClass =
  "rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

const STATUS_BADGE_CLASS: Record<DataSource["approvalStatus"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-slate-200 text-slate-600",
};

function RegisterDataSourceForm({ canManage, onAdded }: { canManage: boolean; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<DataSource["sourceType"]>("website_lead_form");
  const [owner, setOwner] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [consentStatus, setConsentStatus] = useState<DataSource["consentStatus"]>("not_applicable");
  const [approvedUse, setApprovedUse] = useState("");
  const [description, setDescription] = useState("");
  const [dataFieldsReceived, setDataFieldsReceived] = useState("");
  const [licenceReference, setLicenceReference] = useState("");
  const [retentionPeriodDays, setRetentionPeriodDays] = useState("");
  const [dataQualityRating, setDataQualityRating] = useState<DataSource["dataQualityRating"]>("unrated");
  const [refreshFrequency, setRefreshFrequency] = useState<DataSource["refreshFrequency"]>("one_off");
  const [containsPersonalInformation, setContainsPersonalInformation] = useState(false);
  const [allowedForMarketIntelligenceOnly, setAllowedForMarketIntelligenceOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canManage) return null;

  async function submit() {
    if (!name.trim() || !owner.trim() || !legalBasis.trim() || !approvedUse.trim()) {
      setError("Name, owner, legal basis, and approved use are all required");
      return;
    }
    const retentionDays = retentionPeriodDays.trim() ? Number(retentionPeriodDays) : undefined;
    if (retentionDays !== undefined && (!Number.isInteger(retentionDays) || retentionDays < 1)) {
      setError("Retention period must be a whole number of days");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await postJson("/api/data-sources", {
        name: name.trim(),
        sourceType,
        owner: owner.trim(),
        legalBasis: legalBasis.trim(),
        consentStatus,
        approvedUse: approvedUse.trim(),
        description: description.trim() || undefined,
        dataFieldsReceived: dataFieldsReceived.trim()
          ? dataFieldsReceived.split(",").map((field) => field.trim()).filter(Boolean)
          : undefined,
        licenceReference: licenceReference.trim() || undefined,
        retentionPeriodDays: retentionDays,
        dataQualityRating,
        refreshFrequency,
        containsPersonalInformation,
        allowedForMarketIntelligenceOnly,
      });
      setName("");
      setOwner("");
      setLegalBasis("");
      setApprovedUse("");
      setDescription("");
      setDataFieldsReceived("");
      setLicenceReference("");
      setRetentionPeriodDays("");
      setContainsPersonalInformation(false);
      setAllowedForMarketIntelligenceOnly(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The data source could not be registered");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Register a data source</h4>
      <p className="mt-1 text-xs text-slate-500">
        Every field below is required before this source can be approved - no automated scraping, and no import may use an
        unapproved source. See the allowed categories list in the project brief.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className={fieldLabel()}>
          Source name
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="e.g. Q4 trade show lead scans" />
        </label>
        <label className={fieldLabel()}>
          Category
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value as DataSource["sourceType"])} className={inputClass}>
            {DATA_SOURCE_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={fieldLabel()}>
          Owner
          <input value={owner} onChange={(event) => setOwner(event.target.value)} className={inputClass} placeholder="Team or person accountable for it" />
        </label>
        <label className={fieldLabel()}>
          Consent status
          <select value={consentStatus} onChange={(event) => setConsentStatus(event.target.value as DataSource["consentStatus"])} className={inputClass}>
            {DATA_SOURCE_CONSENT_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={fieldLabel("sm:col-span-2")}>
          Legal or permission basis
          <input value={legalBasis} onChange={(event) => setLegalBasis(event.target.value)} className={inputClass} placeholder="e.g. Legitimate interest under a signed referral agreement" />
        </label>
        <label className={fieldLabel("sm:col-span-2")}>
          Approved use
          <input value={approvedUse} onChange={(event) => setApprovedUse(event.target.value)} className={inputClass} placeholder="What this source may be used for" />
        </label>
        <label className={fieldLabel("sm:col-span-2")}>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClass} min-h-[50px]`} placeholder="Optional" />
        </label>
        <label className={fieldLabel("sm:col-span-2")}>
          Data fields received
          <input
            value={dataFieldsReceived}
            onChange={(event) => setDataFieldsReceived(event.target.value)}
            className={inputClass}
            placeholder="Comma-separated, e.g. business name, contact email, industry"
          />
        </label>
        <label className={fieldLabel()}>
          Licence or agreement reference
          <input value={licenceReference} onChange={(event) => setLicenceReference(event.target.value)} className={inputClass} placeholder="Optional" />
        </label>
        <label className={fieldLabel()}>
          Retention period (days)
          <input
            type="number"
            min={1}
            value={retentionPeriodDays}
            onChange={(event) => setRetentionPeriodDays(event.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </label>
        <label className={fieldLabel()}>
          Data quality rating
          <select value={dataQualityRating} onChange={(event) => setDataQualityRating(event.target.value as DataSource["dataQualityRating"])} className={inputClass}>
            {DATA_QUALITY_RATINGS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={fieldLabel()}>
          Refresh frequency
          <select value={refreshFrequency} onChange={(event) => setRefreshFrequency(event.target.value as DataSource["refreshFrequency"])} className={inputClass}>
            {DATA_SOURCE_REFRESH_FREQUENCIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={containsPersonalInformation} onChange={(event) => setContainsPersonalInformation(event.target.checked)} />
          Contains personal information
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={allowedForMarketIntelligenceOnly} onChange={(event) => setAllowedForMarketIntelligenceOnly(event.target.checked)} />
          Market intelligence use only (not for individual lead targeting)
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="mt-3 flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Register data source
      </button>
    </div>
  );
}

const DECISION_OPTIONS: { value: DataSourceApprovalDecision; label: string }[] = [
  { value: "approved", label: "Approve" },
  { value: "rejected", label: "Reject" },
  { value: "suspended", label: "Suspend" },
  { value: "reinstated", label: "Reinstate (re-approve)" },
];

function DataSourceRow({ source, canManage, onChanged }: { source: DataSource; canManage: boolean; onChanged: () => void }) {
  const [decision, setDecision] = useState<DataSourceApprovalDecision>("approved");
  const [notes, setNotes] = useState("");
  const [allowedForMarketing, setAllowedForMarketing] = useState(source.allowedForMarketing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide() {
    setSaving(true);
    setError(null);
    try {
      await postJson(`/api/data-sources/${source.id}/decision`, {
        decision,
        notes: notes.trim() || undefined,
        allowedForMarketing: decision === "approved" || decision === "reinstated" ? allowedForMarketing : undefined,
      });
      setNotes("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The approval decision could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-medium text-slate-800">{source.name}</span>
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {DATA_SOURCE_CATEGORIES.find((option) => option.value === source.sourceType)?.label ?? source.sourceType}
          </span>
          {source.containsPersonalInformation && (
            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">
              Contains PII
            </span>
          )}
          {source.allowedForMarketing && (
            <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-700">
              Marketing allowed
            </span>
          )}
        </div>
        <span data-testid="data-source-status-badge" className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE_CLASS[source.approvalStatus]}`}>
          {DATA_SOURCE_APPROVAL_STATUS_LABELS[source.approvalStatus]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Owner: {source.owner}</span>
        <span>Registered {format(new Date(source.createdAt), "d MMM yyyy")}</span>
        {source.lastReviewedAt && <span>Last reviewed {format(new Date(source.lastReviewedAt), "d MMM yyyy")}</span>}
      </div>
      <p className="text-xs text-slate-500">
        Legal basis: {source.legalBasis} · Approved use: {source.approvedUse}
      </p>
      {source.dataFieldsReceived.length > 0 && (
        <p className="text-xs text-slate-400">Fields received: {source.dataFieldsReceived.join(", ")}</p>
      )}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={decision} onChange={(event) => setDecision(event.target.value as DataSourceApprovalDecision)} className={inputClass}>
            {DECISION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {(decision === "approved" || decision === "reinstated") && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={allowedForMarketing} onChange={(event) => setAllowedForMarketing(event.target.checked)} />
              Allow for marketing
            </label>
          )}
          <input value={notes} onChange={(event) => setNotes(event.target.value)} className={`${inputClass} flex-1`} placeholder="Review notes (optional)" />
          <button
            type="button"
            onClick={() => void decide()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save decision
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function DataSourceRegistry({ dataSources, canManage }: { dataSources: DataSource[]; canManage: boolean }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-4">
      <RegisterDataSourceForm canManage={canManage} onAdded={refresh} />
      {dataSources.length === 0 ? (
        <p className="text-sm text-slate-400">No data sources have been registered yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-5">
          {dataSources.map((source) => (
            <DataSourceRow key={source.id} source={source} canManage={canManage} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}
