"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import type { DataSubjectRequest, DataSubjectRequestStatus, OptOutRequest } from "@/lib/types";
import {
  DATA_SUBJECT_REQUEST_STATUS_LABELS,
  DATA_SUBJECT_REQUEST_TYPES,
  OPT_OUT_CHANNELS,
  OPT_OUT_SOURCES,
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

function LeadLink({ leadId }: { leadId?: string }) {
  if (!leadId) return <span className="text-slate-400">No linked lead</span>;
  return (
    <Link href={`/dashboard/leads/${leadId}`} className="text-primary-700 hover:underline">
      View linked lead
    </Link>
  );
}

function LogOptOutRequestForm({ canManage, onAdded }: { canManage: boolean; onAdded: () => void }) {
  const [channel, setChannel] = useState<OptOutRequest["channel"]>("email");
  const [source, setSource] = useState<OptOutRequest["source"]>("phone_call");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [leadId, setLeadId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canManage) return null;

  async function submit() {
    if (!contactEmail.trim() && !contactPhone.trim() && !leadId.trim()) {
      setError("Enter a contact email, contact phone, or lead ID");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await postJson("/api/compliance/opt-out-requests", {
        channel,
        source,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        leadId: leadId.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setLeadId("");
      setReason("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The opt-out request could not be logged");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Log an opt-out request</h4>
      <p className="mt-1 text-xs text-slate-500">
        For a request received by phone, email, WhatsApp, or letter - not a form submission, which already captures consent
        directly.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className={fieldLabel()}>
          Channel
          <select value={channel} onChange={(event) => setChannel(event.target.value as OptOutRequest["channel"])} className={inputClass}>
            {OPT_OUT_CHANNELS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={fieldLabel()}>
          How the request was received
          <select value={source} onChange={(event) => setSource(event.target.value as OptOutRequest["source"])} className={inputClass}>
            {OPT_OUT_SOURCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={fieldLabel()}>
          Contact name
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} className={inputClass} placeholder="Optional" />
        </label>
        <label className={fieldLabel()}>
          Lead ID
          <input value={leadId} onChange={(event) => setLeadId(event.target.value)} className={inputClass} placeholder="Optional - paste from the lead's profile URL" />
        </label>
        <label className={fieldLabel()}>
          Contact email
          <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={inputClass} placeholder="name@business.co.za" />
        </label>
        <label className={fieldLabel()}>
          Contact phone
          <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className={inputClass} placeholder="082 000 0000" />
        </label>
      </div>
      <label className={fieldLabel("mt-2")}>
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={`${inputClass} min-h-[60px]`}
          placeholder="Optional - what the contact said"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="mt-3 flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Log opt-out request
      </button>
    </div>
  );
}

function OptOutRequestRow({ request, canManage, onChanged }: { request: OptOutRequest; canManage: boolean; onChanged: () => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function process() {
    setSaving(true);
    setError(null);
    try {
      await postJson(`/api/compliance/opt-out-requests/${request.id}/process`, { resolutionNotes: notes.trim() || undefined });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The opt-out request could not be processed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-slate-800">
            {request.contactName || request.contactEmail || request.contactPhone || "Unidentified contact"}
          </span>
          <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">{request.channel} · {request.source.replace(/_/g, " ")}</span>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            request.status === "new" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {request.status === "new" ? "New" : "Processed"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Requested {format(new Date(request.requestedAt), "d MMM yyyy")}</span>
        <LeadLink leadId={request.leadId} />
      </div>
      {request.reason && <p className="text-xs text-slate-500">&ldquo;{request.reason}&rdquo;</p>}
      {request.status === "processed" ? (
        <p className="text-xs text-slate-400">
          Processed {request.processedAt ? format(new Date(request.processedAt), "d MMM yyyy") : ""} by {request.processedBy}
          {request.resolutionNotes ? ` - ${request.resolutionNotes}` : ""}
        </p>
      ) : canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="Resolution notes (optional)"
          />
          <button
            type="button"
            onClick={() => void process()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Mark processed
          </button>
        </div>
      ) : null}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}

function LogDataSubjectRequestForm({ canManage, onAdded }: { canManage: boolean; onAdded: () => void }) {
  const [requestType, setRequestType] = useState<DataSubjectRequest["requestType"]>("access");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [leadId, setLeadId] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canManage) return null;

  async function submit() {
    if (!requesterName.trim() || !requesterEmail.trim()) {
      setError("Enter the requester's name and email");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await postJson("/api/compliance/data-subject-requests", {
        requestType,
        requesterName: requesterName.trim(),
        requesterEmail: requesterEmail.trim(),
        requesterPhone: requesterPhone.trim() || undefined,
        leadId: leadId.trim() || undefined,
        details: details.trim() || undefined,
      });
      setRequesterName("");
      setRequesterEmail("");
      setRequesterPhone("");
      setLeadId("");
      setDetails("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The data subject request could not be logged");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Log a data subject request</h4>
      <p className="mt-1 text-xs text-slate-500">
        Access, correction, or deletion under POPIA. A deletion request, once completed against a linked lead, redacts that
        lead&apos;s personal-identifying fields - this cannot be undone.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className={fieldLabel()}>
          Request type
          <select value={requestType} onChange={(event) => setRequestType(event.target.value as DataSubjectRequest["requestType"])} className={inputClass}>
            {DATA_SUBJECT_REQUEST_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={fieldLabel()}>
          Lead ID
          <input value={leadId} onChange={(event) => setLeadId(event.target.value)} className={inputClass} placeholder="Optional - paste from the lead's profile URL" />
        </label>
        <label className={fieldLabel()}>
          Requester name
          <input value={requesterName} onChange={(event) => setRequesterName(event.target.value)} className={inputClass} />
        </label>
        <label className={fieldLabel()}>
          Requester email
          <input value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} className={inputClass} />
        </label>
        <label className={fieldLabel()}>
          Requester phone
          <input value={requesterPhone} onChange={(event) => setRequesterPhone(event.target.value)} className={inputClass} placeholder="Optional" />
        </label>
      </div>
      <label className={fieldLabel("mt-2")}>
        Details
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          className={`${inputClass} min-h-[60px]`}
          placeholder="Optional - what the requester asked for"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="mt-3 flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Log data subject request
      </button>
    </div>
  );
}

const OPEN_DSR_STATUSES: DataSubjectRequestStatus[] = ["verifying", "in_progress", "completed", "rejected"];

function DataSubjectRequestRow({
  request,
  canManage,
  onChanged,
}: {
  request: DataSubjectRequest & { overdue: boolean };
  canManage: boolean;
  onChanged: () => void;
}) {
  const [nextStatus, setNextStatus] = useState<DataSubjectRequestStatus>(
    request.status === "received" ? "verifying" : request.status,
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFinal = request.status === "completed" || request.status === "rejected";
  // Computed server-side (see getComplianceOverview()) rather than compared
  // against Date.now() here during render.
  const overdue = !isFinal && request.overdue;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await postJson(`/api/compliance/data-subject-requests/${request.id}/status`, {
        status: nextStatus,
        resolutionNotes: notes.trim() || undefined,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The data subject request could not be updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-slate-800">{request.requesterName}</span>
          <span className="ml-2 text-xs text-slate-500">{request.requesterEmail}</span>
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {request.requestType}
          </span>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            isFinal ? "bg-slate-100 text-slate-500" : overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {overdue ? "Overdue" : DATA_SUBJECT_REQUEST_STATUS_LABELS[request.status]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Received {format(new Date(request.receivedAt), "d MMM yyyy")}</span>
        <span>Due {format(new Date(request.dueAt), "d MMM yyyy")}</span>
        <LeadLink leadId={request.leadId} />
      </div>
      {request.details && <p className="text-xs text-slate-500">&ldquo;{request.details}&rdquo;</p>}
      {isFinal ? (
        <p className="text-xs text-slate-400">
          {DATA_SUBJECT_REQUEST_STATUS_LABELS[request.status]} {request.completedAt ? format(new Date(request.completedAt), "d MMM yyyy") : ""} by {request.handledBy}
          {request.resolutionNotes ? ` - ${request.resolutionNotes}` : ""}
        </p>
      ) : canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as DataSubjectRequestStatus)}
            className={inputClass}
          >
            {OPEN_DSR_STATUSES.map((status) => (
              <option key={status} value={status}>{DATA_SUBJECT_REQUEST_STATUS_LABELS[status]}</option>
            ))}
          </select>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="Resolution notes (optional)"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {nextStatus === "completed" && request.requestType === "deletion" && request.leadId && (
            <p className="w-full text-xs text-amber-600">
              Marking this completed will immediately redact the linked lead&apos;s personal-identifying fields. This cannot be undone.
            </p>
          )}
        </div>
      ) : null}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function ComplianceRequestsPanel({
  optOutRequests,
  dataSubjectRequests,
  canManage,
}: {
  optOutRequests: OptOutRequest[];
  dataSubjectRequests: (DataSubjectRequest & { overdue: boolean })[];
  canManage: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div data-testid="opt-out-requests-panel" className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Opt-out requests</h3>
        <p className="mt-1 text-xs text-slate-500">
          Requests to stop contact received outside a form submission (phone, email, WhatsApp, letter). Processing one sets
          the linked lead to Do Not Contact.
        </p>
        <div className="mt-4">
          <LogOptOutRequestForm canManage={canManage} onAdded={refresh} />
        </div>
        {optOutRequests.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No opt-out requests have been logged.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {optOutRequests.map((request) => (
              <OptOutRequestRow key={request.id} request={request} canManage={canManage} onChanged={refresh} />
            ))}
          </ul>
        )}
      </div>

      <div data-testid="data-subject-requests-panel" className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Data subject requests</h3>
        <p className="mt-1 text-xs text-slate-500">
          Access, correction, and deletion requests under POPIA, with a 30-day response target.
        </p>
        <div className="mt-4">
          <LogDataSubjectRequestForm canManage={canManage} onAdded={refresh} />
        </div>
        {dataSubjectRequests.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No data subject requests have been logged.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {dataSubjectRequests.map((request) => (
              <DataSubjectRequestRow key={request.id} request={request} canManage={canManage} onChanged={refresh} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
