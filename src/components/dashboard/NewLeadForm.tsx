"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CURRENT_INSURANCE_STATUS, PROVINCES } from "@/lib/constants";
import { CONTACT_BASIS_OPTIONS } from "@/lib/validation/staffLeadSchema";

type Option = { value: string; label: string };
type FieldErrors = Record<string, string[] | undefined>;

const inputClass = "rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-slate-600";

const initial = {
  applicantType: "individual" as "individual" | "business",
  businessName: "",
  industry: "",
  contactFullName: "",
  contactRole: "",
  contactEmail: "",
  contactMobile: "",
  preferredContactChannel: "phone",
  preferredContactTime: "",
  province: "",
  city: "",
  suburb: "",
  currentInsuranceStatus: "unsure",
  mainConcern: "",
  contactBasis: "",
  contactBasisNote: "",
};

// Staff "New lead" form (/dashboard/leads/new). Posts to /api/leads/staff,
// which checks the role and every field again on the server; the database
// decides which practice the lead belongs to.
export function NewLeadForm({ products }: { products: { individual: Option[]; business: Option[] } }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [duplicateLeadId, setDuplicateLeadId] = useState<string | null>(null);

  const options = products[values.applicantType];
  const set = (field: keyof typeof initial) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  function changeApplicantType(applicantType: "individual" | "business") {
    setValues((current) => ({ ...current, applicantType }));
    const allowed = new Set(products[applicantType].map((option) => option.value));
    setSelectedProducts((current) => current.filter((product) => allowed.has(product)));
  }

  function toggleProduct(product: string) {
    setSelectedProducts((current) =>
      current.includes(product) ? current.filter((item) => item !== product) : [...current, product]);
  }

  async function submit(allowDuplicate: boolean) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch("/api/leads/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          insuranceProducts: selectedProducts,
          contactPermissionConfirmed: confirmed,
          allowDuplicate,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 && body.duplicateLeadId) {
        setDuplicateLeadId(body.duplicateLeadId);
        setError(body.error);
        return;
      }
      if (!response.ok) {
        setFieldErrors(body.issues ?? {});
        throw new Error(body.error ?? "The lead could not be added");
      }
      router.push(`/dashboard/leads/${body.leadId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lead could not be added");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDuplicateLeadId(null);
    void submit(false);
  }

  const fieldError = (field: string) =>
    fieldErrors[field]?.[0] ? <span className="text-xs font-normal text-red-700">{fieldErrors[field]?.[0]}</span> : null;

  if (options.length === 0 && products.individual.length === 0 && products.business.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Your practice has no verified product authorisations yet, so a lead cannot be added. Add your FSP or
        representative details on your profile page and wait for them to be verified.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" data-testid="new-lead-form" noValidate>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Who is the lead?</h2>
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-slate-600">This lead is</legend>
          <div className="mt-1.5 flex gap-4 text-sm text-slate-900">
            {(["individual", "business"] as const).map((type) => (
              <label key={type} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="applicantType"
                  checked={values.applicantType === type}
                  onChange={() => changeApplicantType(type)}
                />
                {type === "individual" ? "A person" : "A business"}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {values.applicantType === "business" && (
            <>
              <label className={labelClass}>
                Business name
                <input className={inputClass} value={values.businessName} onChange={set("businessName")} maxLength={200} />
                {fieldError("businessName")}
              </label>
              <label className={labelClass}>
                Industry (optional)
                <input className={inputClass} value={values.industry} onChange={set("industry")} maxLength={120} />
              </label>
            </>
          )}
          <label className={labelClass}>
            {values.applicantType === "business" ? "Contact person's full name" : "Full name"}
            <input className={inputClass} value={values.contactFullName} onChange={set("contactFullName")} maxLength={200} autoComplete="off" />
            {fieldError("contactFullName")}
          </label>
          {values.applicantType === "business" && (
            <label className={labelClass}>
              Role (optional)
              <input className={inputClass} value={values.contactRole} onChange={set("contactRole")} maxLength={120} />
            </label>
          )}
          <label className={labelClass}>
            Mobile number
            <input className={inputClass} value={values.contactMobile} onChange={set("contactMobile")} inputMode="tel" maxLength={15} placeholder="e.g. 082 555 0100" autoComplete="off" />
            {fieldError("contactMobile")}
          </label>
          <label className={labelClass}>
            Email address
            <input className={inputClass} type="email" value={values.contactEmail} onChange={set("contactEmail")} maxLength={254} autoComplete="off" />
            {fieldError("contactEmail")}
          </label>
          <label className={labelClass}>
            Prefers to be contacted by
            <select className={inputClass} value={values.preferredContactChannel} onChange={set("preferredContactChannel")}>
              <option value="phone">Phone call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label className={labelClass}>
            Best time to contact (optional)
            <input className={inputClass} value={values.preferredContactTime} onChange={set("preferredContactTime")} maxLength={120} placeholder="e.g. weekdays after 17:00" />
          </label>
          <label className={labelClass}>
            Province
            <select className={inputClass} value={values.province} onChange={set("province")}>
              <option value="">Select a province</option>
              {PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
            </select>
            {fieldError("province")}
          </label>
          <label className={labelClass}>
            City or town
            <input className={inputClass} value={values.city} onChange={set("city")} maxLength={120} />
            {fieldError("city")}
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">What do they need?</h2>
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-slate-600">Products they asked about</legend>
          {options.length === 0 ? (
            <p className="mt-1.5 text-sm text-slate-500">
              Your practice is not authorised for any product for this kind of lead.
            </p>
          ) : (
            <div className="mt-1.5 grid gap-2 text-sm text-slate-900 sm:grid-cols-2">
              {options.map((option) => (
                <label key={option.value} className="flex items-center gap-2">
                  <input type="checkbox" checked={selectedProducts.includes(option.value)} onChange={() => toggleProduct(option.value)} />
                  {option.label}
                </label>
              ))}
            </div>
          )}
          {fieldError("insuranceProducts")}
        </fieldset>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Current cover
            <select className={inputClass} value={values.currentInsuranceStatus} onChange={set("currentInsuranceStatus")}>
              {CURRENT_INSURANCE_STATUS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            What they said they need (optional)
            <textarea className={inputClass} rows={3} value={values.mainConcern} onChange={set("mainConcern")} maxLength={500} />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Permission to contact</h2>
        <p className="mt-1 text-xs text-slate-500">
          Only add someone who has agreed to be contacted by your practice. This lead stays private to your practice:
          it is never offered to another broker and is never included in an email campaign.
        </p>
        <div className="mt-3 grid gap-3">
          <label className={labelClass}>
            How did they agree to be contacted?
            <select className={inputClass} value={values.contactBasis} onChange={set("contactBasis")}>
              <option value="">Select one</option>
              {CONTACT_BASIS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {fieldError("contactBasis")}
          </label>
          <label className={labelClass}>
            Details {values.contactBasis === "other" ? "" : "(optional)"}
            <input className={inputClass} value={values.contactBasisNote} onChange={set("contactBasisNote")} maxLength={500} placeholder="e.g. phoned the office on 12 November asking for a quote" />
            {fieldError("contactBasisNote")}
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-900">
            <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>I confirm this person agreed to be contacted by our practice about insurance.</span>
          </label>
          {fieldError("contactPermissionConfirmed")}
        </div>
      </section>

      {error && (
        <div role="alert" data-testid="new-lead-error" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
          {duplicateLeadId && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link href={`/dashboard/leads/${duplicateLeadId}`} className="font-medium text-primary-700 underline">
                Open the existing lead
              </Link>
              <button
                type="button"
                onClick={() => void submit(true)}
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Add as a new lead anyway
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Add lead
        </button>
        <Link href="/dashboard/leads" className="text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</Link>
      </div>
    </form>
  );
}
