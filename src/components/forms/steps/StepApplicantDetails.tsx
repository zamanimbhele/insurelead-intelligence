import { ConsultationFormHandle } from "@/lib/validation/consultationSchema";
import { Field, inputClass } from "../FormField";
import {
  INDUSTRIES,
  BUSINESS_TYPES,
  EMPLOYEE_BANDS,
  TURNOVER_BANDS,
  YEARS_IN_OPERATION,
  PROVINCES,
  INSURANCE_PRODUCTS,
} from "@/lib/constants";
import type { ChangeEvent } from "react";
import type { ApplicantType } from "@/lib/types";

export function StepApplicantDetails({ form }: { form: ConsultationFormHandle }) {
  const {
    register,
    watch,
    formState: { errors },
  } = form;
  const applicantType = watch("applicantType");
  const applicantTypeField = register("applicantType");

  function changeApplicantType(event: ChangeEvent<HTMLInputElement>) {
    void applicantTypeField.onChange(event);
    const nextType = event.target.value as ApplicantType;
    const compatibleProducts = form.getValues("insuranceProducts").filter((selected) =>
      INSURANCE_PRODUCTS.find((product) => product.value === selected)?.applicantTypes.includes(nextType),
    );
    form.setValue("insuranceProducts", compatibleProducts, { shouldValidate: false });
    if (nextType === "individual") {
      form.setValue("businessCoverInterests", []);
      form.setValue("businessName", undefined);
      form.setValue("tradingName", undefined);
      form.setValue("industry", undefined);
      form.setValue("businessType", undefined);
      form.setValue("employeeBand", undefined);
      form.setValue("turnoverBand", undefined);
      form.setValue("yearsInOperation", undefined);
      form.setValue("website", undefined);
      form.setValue("financialYearEndMonth", undefined);
      form.setValue("contactRole", undefined);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Who needs insurance?"
        htmlFor="applicantType"
        error={errors.applicantType?.message}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
            <input
              type="radio"
              value="individual"
              className="mt-1 h-4 w-4 border-slate-300 text-primary-600"
              {...applicantTypeField}
              onChange={changeApplicantType}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Me or my household</span>
              <span className="mt-1 block text-xs text-slate-500">Personal insurance products</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
            <input
              type="radio"
              value="business"
              className="mt-1 h-4 w-4 border-slate-300 text-primary-600"
              {...applicantTypeField}
              onChange={changeApplicantType}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">My business</span>
              <span className="mt-1 block text-xs text-slate-500">Commercial insurance products</span>
            </span>
          </label>
        </div>
      </Field>

      {applicantType === "business" && (
        <div className="grid gap-5 border-t border-slate-200 pt-6 sm:grid-cols-2">
          <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message} className="sm:col-span-2">
            <input id="businessName" className={inputClass} {...register("businessName")} />
          </Field>
          <Field label="Trading name" htmlFor="tradingName" optional error={errors.tradingName?.message}>
            <input id="tradingName" className={inputClass} {...register("tradingName")} />
          </Field>
          <Field label="Industry" htmlFor="industry" error={errors.industry?.message}>
            <select id="industry" className={inputClass} {...register("industry")} defaultValue="">
              <option value="" disabled>Select industry</option>
              {INDUSTRIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Business type" htmlFor="businessType" error={errors.businessType?.message}>
            <select id="businessType" className={inputClass} {...register("businessType")} defaultValue="">
              <option value="" disabled>Select business type</option>
              {BUSINESS_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Number of employees" htmlFor="employeeBand" error={errors.employeeBand?.message}>
            <select id="employeeBand" className={inputClass} {...register("employeeBand")} defaultValue="">
              <option value="" disabled>Select company size</option>
              {EMPLOYEE_BANDS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Annual turnover range" htmlFor="turnoverBand" error={errors.turnoverBand?.message}>
            <select id="turnoverBand" className={inputClass} {...register("turnoverBand")} defaultValue="">
              <option value="" disabled>Select turnover range</option>
              {TURNOVER_BANDS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Years in operation" htmlFor="yearsInOperation" error={errors.yearsInOperation?.message}>
            <select id="yearsInOperation" className={inputClass} {...register("yearsInOperation")} defaultValue="">
              <option value="" disabled>Select years in operation</option>
              {YEARS_IN_OPERATION.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
        </div>
      )}

      {applicantType && (
        <div className="grid gap-5 border-t border-slate-200 pt-6 sm:grid-cols-2">
          <Field label="Province" htmlFor="province" error={errors.province?.message}>
            <select id="province" className={inputClass} {...register("province")} defaultValue="">
              <option value="" disabled>Select province</option>
              {PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
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
          {applicantType === "business" && (
            <Field label="Business website" htmlFor="website" optional error={errors.website?.message} className="sm:col-span-2">
              <input id="website" placeholder="https://" className={inputClass} {...register("website")} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
