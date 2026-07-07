import { UseFormReturn } from "react-hook-form";
import { ConsultationFormValues } from "@/lib/validation/consultationSchema";
import Link from "next/link";

export function StepConsent({ form }: { form: UseFormReturn<ConsultationFormValues> }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-600">
        Please review and confirm the following before submitting your enquiry.
      </p>

      <label className="flex items-start gap-3 rounded-md border border-slate-200 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600" {...register("privacyNoticeAccepted")} />
        <span>
          I have read and acknowledge the{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-primary-700 underline">
            Privacy Notice
          </Link>
          .
        </span>
      </label>
      {errors.privacyNoticeAccepted && <p className="text-xs text-red-600">{errors.privacyNoticeAccepted.message}</p>}

      <label className="flex items-start gap-3 rounded-md border border-slate-200 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600" {...register("contactConsent")} />
        <span>
          I am requesting contact regarding <strong>business insurance</strong> and consent to be contacted about
          this enquiry via my selected contact channel (phone, email, or WhatsApp).
        </span>
      </label>
      {errors.contactConsent && <p className="text-xs text-red-600">{errors.contactConsent.message}</p>}

      <label className="flex items-start gap-3 rounded-md border border-slate-200 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600" {...register("marketingConsent")} />
        <span>
          <strong>Optional:</strong> I would also like to receive future business insurance marketing communications.
          I understand I can unsubscribe at any time.
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-md border border-slate-200 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600" {...register("accuracyConfirmed")} />
        <span>I confirm that the information I have submitted is accurate to the best of my knowledge.</span>
      </label>
      {errors.accuracyConfirmed && <p className="text-xs text-red-600">{errors.accuracyConfirmed.message}</p>}

      <label className="flex items-start gap-3 rounded-md border border-slate-200 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600" {...register("nonBindingAcknowledged")} />
        <span>I understand that submitting this enquiry does not create insurance cover or a binding quote.</span>
      </label>
      {errors.nonBindingAcknowledged && <p className="text-xs text-red-600">{errors.nonBindingAcknowledged.message}</p>}

      {/* Honeypot field - hidden from real users via CSS, bots often fill every field */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website_url">Leave this field empty</label>
        <input id="website_url" type="text" tabIndex={-1} autoComplete="off" {...register("website_url")} />
      </div>
    </div>
  );
}
