import { UseFormReturn } from "react-hook-form";
import { ConsultationFormValues } from "@/lib/validation/consultationSchema";
import { Field, inputClass } from "../FormField";

export function StepContactPerson({ form }: { form: UseFormReturn<ConsultationFormValues> }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" htmlFor="contactFullName" error={errors.contactFullName?.message}>
        <input id="contactFullName" className={inputClass} {...register("contactFullName")} />
      </Field>
      <Field label="Role or job title" htmlFor="contactRole" error={errors.contactRole?.message}>
        <input id="contactRole" className={inputClass} {...register("contactRole")} />
      </Field>
      <Field label="Work email address" htmlFor="contactEmail" error={errors.contactEmail?.message}>
        <input id="contactEmail" type="email" className={inputClass} {...register("contactEmail")} />
      </Field>
      <Field label="Mobile number" htmlFor="contactMobile" error={errors.contactMobile?.message}>
        <input id="contactMobile" type="tel" placeholder="082 000 0000" className={inputClass} {...register("contactMobile")} />
      </Field>
      <Field label="Preferred contact method" htmlFor="preferredContactMethod" error={errors.preferredContactMethod?.message} className="sm:col-span-2">
        <select id="preferredContactMethod" className={inputClass} {...register("preferredContactMethod")} defaultValue="">
          <option value="" disabled>Select method</option>
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </Field>
    </div>
  );
}
