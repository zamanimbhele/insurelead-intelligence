"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EVIDENCE_TYPES, type EvidenceType } from "@/lib/authorisations";

export type AuthorisationCategoryOption = {
  id: string;
  name: string;
  offered: boolean;
  acceptedEvidence: string[];
  evidenceGuidance: string;
  guidanceIsPlaceholder: boolean;
};

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Something went wrong");
  return result;
}

// A broker or advisor records an authorisation for one category.
export function AuthorisationForm({ categories }: { categories: AuthorisationCategoryOption[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const category = categories.find((item) => item.id === categoryId);
  const evidenceOptions = useMemo(
    () => EVIDENCE_TYPES.filter((item) => category?.acceptedEvidence.includes(item.value)),
    [category],
  );
  const [evidenceType, setEvidenceType] = useState<EvidenceType | "">("");
  const evidence = EVIDENCE_TYPES.find((item) => item.value === evidenceType);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [providerName, setProviderName] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function chooseCategory(id: string) {
    setCategoryId(id);
    const next = categories.find((item) => item.id === id);
    setEvidenceType(next?.acceptedEvidence.length === 1 ? (next.acceptedEvidence[0] as EvidenceType) : "");
  }

  async function submit() {
    setError(null);
    setNotice(null);
    if (!categoryId || !evidenceType) {
      setError("Choose a category and the evidence you hold");
      return;
    }
    setBusy(true);
    try {
      await post("/api/authorisations", { categoryId, evidenceType, referenceNumber, providerName, expiresOn, evidenceNote });
      setNotice("Recorded. The InsureLead team will review it.");
      setCategoryId("");
      setEvidenceType("");
      setReferenceNumber("");
      setProviderName("");
      setExpiresOn("");
      setEvidenceNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The authorisation could not be recorded");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="authorisation-form">
      <p className="text-sm font-semibold text-slate-900">Add an authorisation</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Product category
          <select value={categoryId} onChange={(event) => chooseCategory(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800">
            <option value="">Choose…</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>{item.name}{item.offered ? "" : " (not yet offered)"}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Evidence
          <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as EvidenceType)} disabled={!category} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100">
            <option value="">Choose…</option>
            {evidenceOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {category && (
        <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600" data-testid="evidence-guidance">
          {category.guidanceIsPlaceholder && (
            <span className="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Placeholder guidance · to be confirmed
            </span>
          )}
          <p>{category.evidenceGuidance}</p>
        </div>
      )}

      {evidence && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {evidence.referenceLabel}
            <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} maxLength={60} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800" />
          </label>
          {evidence.providerLabel && (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {evidence.providerLabel}
              <input value={providerName} onChange={(event) => setProviderName(event.target.value)} maxLength={160} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Expiry date (if it has one)
            <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            Anything the reviewer should know (optional)
            <textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} maxLength={1000} rows={2} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800" />
          </label>
        </div>
      )}

      <button type="button" onClick={() => void submit()} disabled={busy} className="mt-3 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
        {busy ? "Saving…" : "Submit for review"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-emerald-700">{notice}</p>}
    </div>
  );
}

// The holder withdraws their own pending or verified authorisation.
export function WithdrawAuthorisationButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await post(`/api/authorisations/${id}/withdraw`);
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not withdraw");
          } finally {
            setBusy(false);
          }
        }}
        className="text-xs font-medium text-slate-500 underline hover:text-red-700 disabled:opacity-50"
      >
        Withdraw
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

// Platform admins: verify (optionally with an expiry), reject or revoke.
// Revoking is tucked behind its own button so verified rows stay calm.
export function AuthorisationReviewControls({ id, status }: { id: string; status: "pending" | "verified" }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function decide(decision: "verify" | "reject" | "revoke") {
    setBusy(decision);
    setError(null);
    try {
      await post(`/api/authorisations/${id}/review`, { decision, note, expiresOn });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the decision");
    } finally {
      setBusy(null);
    }
  }

  if (status === "verified" && !revoking) {
    return (
      <button type="button" onClick={() => setRevoking(true)} className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-800">
        Revoke…
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="authorisation-review">
      <div className="flex flex-wrap items-end gap-2">
        {status === "pending" && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Expires (optional)
            <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
          </label>
        )}
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-500">
          {status === "pending" ? "Reason (needed to reject)" : "Reason (needed to revoke)"}
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "pending" ? (
          <>
            <button type="button" disabled={busy !== null} onClick={() => void decide("verify")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy === "verify" ? "Verifying…" : "Verify"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void decide("reject")} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy !== null} onClick={() => void decide("revoke")} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              {busy === "revoke" ? "Revoking…" : "Revoke"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => { setRevoking(false); setError(null); }} className="px-2 text-xs font-medium text-slate-500">
              Cancel
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
