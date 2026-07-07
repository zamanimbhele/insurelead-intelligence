import { UseFormReturn } from "react-hook-form";
import { ConsultationFormValues } from "@/lib/validation/consultationSchema";
import { Field, inputClass } from "../FormField";
import { INDUSTRIES, BUSINESS_TYPES, EMPLOYEE_BANDS, TURNOVER_BANDS, YEARS_IN_OPERATION, PROVINCES } from "@/lib/constants";

export function StepBusinessDetails({ form }: { form: UseFormReturn<ConsultationFormValues> }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message} className="sm:col-span-2">
        <input id="businessName" className={inputClass} {...register("businessName")} />
      </Field>
      <Field label="Trading name" htmlFor="tradingName" optional error={errors.tradingName?.message}>
        <input id="tradingName" className={inputClass} {...register("tradingName")} />
      </Field>
      <Field label="Industry" htmlFor="industry" error={errors.industry?.message}>
        <select id="industry" className={inputClass} {...register("industry")} defaultValue="">
          <option value="" disabled>Select industry</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="Business type" htmlFor="businessType" error={errors.businessType?.message}>
        <select id="businessType" className={inputClass} {...register("businessType")} defaultValue="">
          <option value="" disabled>Select business type</option>
          {BUSINESS_TYPES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="Number of employees" htmlFor="employeeBand" error={errors.employeeBand?.message}>
        <select id="employeeBand" className={inputClass} {...register("employeeBand")} defaultValue="">
          <option value="" disabled>Select range</option>
          {EMPLOYEE_BANDS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="Annual turnover range" htmlFor="turnoverBand" error={errors.turnoverBand?.message}>
        <select id="turnoverBand" className={inputClass} {...register("turnoverBand")} defaultValue="">
          <option value="" disabled>Select range</option>
          {TURNOVER_BANDS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="Years in operation" htmlFor="yearsInOperation" error={errors.yearsInOperation?.message}>
        <select id="yearsInOperation" className={inputClass} {...register("yearsInOperation")} defaultValue="">
          <option value="" disabled>Select range</option>
          {YEARS_IN_OPERATION.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="Province" htmlFor="province" error={errors.province?.message}>
        <select id="province" className={inputClass} {...register("province")} defaultValue="">
          <option value="" disabled>Select province</option>
          {PROVINCES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="City or town" htmlFor="city" error={errors.city?.message}>
        <input id="city" className={inputClass} {...register("city")} />
      </Field>
      <Field label="Suburb" htmlFor="suburb" optional error={errors.suburb?.message}>
        <input id="suburb" className={inputClass} {...register("suburb")} />
      </Field>
      <Field label="Postal code" htmlFor="postalCode" optional error={errors.postalCode?.message}>
        <input id="postalCode" className={inputClass} {...register("postalCode")} />
      </Field>
      <Field label="Business website" htmlFor="website" optional error={errors.website?.message} className="sm:col-span-2">
        <input id="website" placeholder="https://" className={inputClass} {...register("website")} />
      </Field>
    </div>
  );
}
