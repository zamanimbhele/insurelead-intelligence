import { Suspense } from "react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { ConsultationForm } from "@/components/forms/ConsultationForm";
import { getCaptchaMode } from "@/lib/security/captcha";

export const metadata = { title: "Request a Business Insurance Consultation | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default function ConsultationPage() {
  const turnstileSiteKey = getCaptchaMode() === "turnstile"
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
    : undefined;

  return (
    <Section>
      <SectionHeading
        eyebrow="Consultation Request"
        title="Request a Business Insurance Consultation"
        description="Four short steps. A licensed broker will review your enquiry and get in touch - this is not a binding quote."
        center
      />
      <div className="mt-12">
        <Suspense fallback={null}>
          <ConsultationForm turnstileSiteKey={turnstileSiteKey} />
        </Suspense>
      </div>
    </Section>
  );
}
