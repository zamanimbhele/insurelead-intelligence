"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  consultationFormSchema,
  ConsultationFormInput,
  ConsultationFormValues,
} from "@/lib/validation/consultationSchema";
import { StepApplicantDetails } from "./steps/StepApplicantDetails";
import { StepInsuranceNeeds } from "./steps/StepInsuranceNeeds";
import { StepContactPerson } from "./steps/StepContactPerson";
import { StepConsent } from "./steps/StepConsent";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { TurnstileWidget } from "./TurnstileWidget";
import { INSURANCE_PRODUCTS } from "@/lib/constants";

const STEPS = [
  { key: "applicant", label: "About You", fields: ["applicantType", "businessName", "industry", "businessType", "employeeBand", "turnoverBand", "yearsInOperation", "province", "city", "postalCode", "website"] },
  { key: "needs", label: "Insurance Needs", fields: ["insuranceProducts", "businessCoverInterests", "currentInsuranceStatus", "preferredContactChannel"] },
  { key: "contact", label: "Contact Details", fields: ["contactFullName", "contactRole", "contactEmail", "contactMobile", "preferredContactMethod"] },
  { key: "consent", label: "Consent", fields: ["privacyNoticeAccepted", "contactConsent", "partnerSharingConsent", "maxPartnerRecipients", "accuracyConfirmed", "nonBindingAcknowledged"] },
] as const;

export function ConsultationForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  const handleCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  const utm = useMemo(
    () => ({
      source: searchParams.get("utm_source") ?? undefined,
      medium: searchParams.get("utm_medium") ?? undefined,
      campaign: searchParams.get("utm_campaign") ?? undefined,
      term: searchParams.get("utm_term") ?? undefined,
      content: searchParams.get("utm_content") ?? undefined,
    }),
    [searchParams]
  );

  const requestedProduct = useMemo(
    () => INSURANCE_PRODUCTS.find((product) => product.value === searchParams.get("product")),
    [searchParams],
  );

  const form = useForm<ConsultationFormInput, unknown, ConsultationFormValues>({
    resolver: zodResolver(consultationFormSchema),
    mode: "onBlur",
    defaultValues: {
      applicantType: requestedProduct?.applicantTypes.length === 1
        ? requestedProduct.applicantTypes[0]
        : undefined,
      insuranceProducts: requestedProduct ? [requestedProduct.value] : [],
      businessCoverInterests: [],
      marketingConsent: false,
      maxPartnerRecipients: "1",
    },
  });

  async function goNext() {
    const fields = STEPS[step].fields as unknown as (keyof ConsultationFormInput)[];
    const valid = await form.trigger(fields);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    if (step === STEPS.length - 1 && turnstileSiteKey) {
      setCaptchaToken(null);
      setCaptchaResetSignal((value) => value + 1);
    }
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(values: ConsultationFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          utm,
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
          sourceUrl: typeof window !== "undefined" ? window.location.href.split("?")[0] : undefined,
          captchaToken: captchaToken ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Submission failed. Please try again.");
      }
      // No lead details are passed in the URL - thank-you page is generic.
      router.push("/consultation/thank-you");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      if (turnstileSiteKey) setCaptchaResetSignal((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-10 flex items-center justify-between">
        {STEPS.map((s, idx) => (
          <li key={s.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                  idx < step && "border-primary-600 bg-primary-600 text-white",
                  idx === step && "border-primary-600 text-primary-700",
                  idx > step && "border-slate-300 text-slate-400"
                )}
              >
                {idx < step ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
              </span>
              <span className={cn("hidden text-xs font-medium sm:block", idx === step ? "text-primary-700" : "text-slate-400")}>
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && <div className={cn("mx-2 h-px flex-1", idx < step ? "bg-primary-600" : "bg-slate-200")} />}
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          if (!isLastStep) {
            e.preventDefault();
            goNext();
            return;
          }
          form.handleSubmit(onSubmit)(e);
        }}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h2 className="text-lg font-semibold text-slate-900">{STEPS[step].label}</h2>
        <div className="mt-6">
          {step === 0 && <StepApplicantDetails form={form} />}
          {step === 1 && <StepInsuranceNeeds form={form} />}
          {step === 2 && <StepContactPerson form={form} />}
          {step === 3 && <StepConsent form={form} />}
          {step === 3 && turnstileSiteKey && (
            <div className="mt-6">
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onToken={handleCaptchaToken}
                resetSignal={captchaResetSignal}
              />
              <p className="mt-2 text-xs text-slate-500">
                Complete the security check before submitting your enquiry.
              </p>
            </div>
          )}
        </div>

        {submitError && <p className="mt-4 text-sm text-red-600">{submitError}</p>}

        <div className="mt-8 flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={goBack} disabled={step === 0}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={submitting || Boolean(isLastStep && turnstileSiteKey && !captchaToken)}
          >
            {isLastStep ? (submitting ? "Submitting..." : "Submit Enquiry") : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
