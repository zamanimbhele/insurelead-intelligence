import { UseFormReturn } from "react-hook-form";
import { ConsultationFormValues } from "@/lib/validation/consultationSchema";
import { Field, inputClass } from "../FormField";
import { INSURANCE_PRODUCTS, CURRENT_INSURANCE_STATUS, MONTHS } from "@/lib/constants";

export function StepInsuranceNeeds({ form }: { form: UseFormReturn<ConsultationFormValues> }) {
  const { register, watch, setValue, formState: { errors } } = form;
  const selected = watch("insuranceProducts") ?? [];

  function toggleProduct(value: string) {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    setValue("insuranceProducts", next, { shouldValidate: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <Field label="Insurance products of interest" htmlFor="insuranceProducts" error={errors.insuranceProducts?.message as string}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {INSURANCE_PRODUCTS.map((p) => (
            <label key={p.value} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selected.includes(p.value)} onChange={() => toggleProduct(p.value)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
              {p.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Current insurance status" htmlFor="currentInsuranceStatus" error={errors.currentInsuranceStatus?.message}>
        <select id="currentInsuranceStatus" className={inputClass} {...register("currentInsuranceStatus")} defaultValue="">
          <option value="" disabled>Select status</option>
          {CURRENT_INSURANCE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Current cover renewal month" htmlFor="renewalMonth" optional>
          <select id="renewalMonth" className={inputClass} {...register("renewalMonth")} defaultValue="">
            <option value="">Not sure / not applicable</option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Business financial year-end month" htmlFor="financialYearEndMonth" optional>
          <select id="financialYearEndMonth" className={inputClass} {...register("financialYearEndMonth")} defaultValue="">
            <option value="">Not sure / not applicable</option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Main insurance concern" htmlFor="mainConcern" optional error={errors.mainConcern?.message}>
        <textarea id="mainConcern" rows={3} className={inputClass} placeholder="Briefly describe what prompted this enquiry" {...register("mainConcern")} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Preferred contact time" htmlFor="preferredContactTime" optional>
          <select id="preferredContactTime" className={inputClass} {...register("preferredContactTime")} defaultValue="">
            <option value="">No preference</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </Field>
        <Field label="Preferred contact channel" htmlFor="preferredContactChannel" error={errors.preferredContactChannel?.message}>
          <select id="preferredContactChannel" className={inputClass} {...register("preferredContactChannel")} defaultValue="">
            <option value="" disabled>Select channel</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </Field>
      </div>
    </div>
  );
}
