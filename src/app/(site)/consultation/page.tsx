import { Suspense } from "react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { ConsultationForm } from "@/components/forms/ConsultationForm";
import { getCaptchaMode } from "@/lib/security/captcha";

export const metadata = { title: "Find Insurance Options | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default function ConsultationPage() {
  const turnstileSiteKey = getCaptchaMode() === "turnstile"
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
    : undefined;

  return (
    <Section>
      <SectionHeading
        eyebrow="Insurance Enquiry"
        title="Find Insurance Options"
        description="Four short steps. Select your product interests and sharing preference so a relevant participating broker can follow up. This is not a binding quote."
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
