"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAPACITY_OPTIONS, isPlaceholderWording, renderDisclosure, type BrandMode, type DisclosureCapacity, type OrganisationBrand } from "@/lib/brand";

// Company or personal brand. A personal brand shows a live preview of the
// disclosure that every campaign email will carry.
export function BrandSettingsForm({
  organisationId,
  initial,
  template,
  canEdit,
}: {
  organisationId: string;
  initial: OrganisationBrand;
  template: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<BrandMode>(initial.mode);
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [capacity, setCapacity] = useState<DisclosureCapacity | "">(initial.capacity ?? "");
  const [fspName, setFspName] = useState(initial.fspName ?? "");
  const [fspNumber, setFspNumber] = useState(initial.fspNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const preview = renderDisclosure(template, { mode, displayName, capacity: capacity || undefined, fspName, fspNumber });
  const placeholder = isPlaceholderWording(template);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/organisations/${organisationId}/brand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandMode: mode, displayName, capacity, fspName, fspNumber }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "The branding could not be saved");
      return;
    }
    setNotice(mode === "personal"
      ? "Saved. Generate campaign content again so it carries this disclosure."
      : "Saved.");
    router.refresh();
  }

  const field = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6" data-testid="brand-settings">
      <h2 className="font-semibold text-slate-900">Branding</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Use your company&apos;s brand, or your own name if you may not use your employer&apos;s or FSP&apos;s branding.
        A personal brand always carries a disclosure of who you represent.
      </p>

      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2" disabled={!canEdit}>
        <legend className="sr-only">Brand</legend>
        {([
          ["company", "Company brand", "Campaigns are sent in your organisation's name."],
          ["personal", "Personal brand", "Campaigns use your own name, with a representative disclosure."],
        ] as const).map(([value, title, description]) => (
          <label key={value} className="flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-300 p-3 text-sm has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50">
            <span className="flex items-center gap-2 font-semibold text-slate-900">
              <input type="radio" name="brandMode" value={value} checked={mode === value} onChange={() => setMode(value)} className="h-4 w-4" />
              {title}
            </span>
            <span className="text-xs text-slate-500">{description}</span>
          </label>
        ))}
      </fieldset>

      {mode === "personal" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            Your name as it appears on emails
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} disabled={!canEdit} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Your capacity
            <select value={capacity} onChange={(event) => setCapacity(event.target.value as DisclosureCapacity | "")} disabled={!canEdit} className={field}>
              <option value="">Choose…</option>
              {CAPACITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Authorised FSP you act for
            <input value={fspName} onChange={(event) => setFspName(event.target.value)} maxLength={160} disabled={!canEdit} className={field} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            FSP number
            <input value={fspNumber} onChange={(event) => setFspNumber(event.target.value)} maxLength={40} disabled={!canEdit} className={field} />
          </label>
          <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600" data-testid="disclosure-preview">
            <p className="font-semibold text-slate-700">
              Footer on every campaign email
              {placeholder && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Placeholder wording · to be confirmed</span>}
            </p>
            <p className="mt-1">{preview ?? "Fill in all four details to see the disclosure."}</p>
          </div>
        </div>
      )}

      {canEdit ? (
        <button type="button" onClick={() => void save()} disabled={busy} className="mt-4 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          {busy ? "Saving…" : "Save branding"}
        </button>
      ) : (
        <p className="mt-4 text-xs text-slate-500">Only your broker admin can change the branding.</p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-emerald-700">{notice}</p>}
    </section>
  );
}
