import { Suspense } from "react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { ConsultationForm } from "@/components/forms/ConsultationForm";
import { getCaptchaMode } from "@/lib/security/captcha";
import { getRuntimeLegalTextDocuments } from "@/lib/runtime-data";
import type { LegalTextDocumentKey } from "@/lib/types";

export const metadata = { title: "Find Insurance Options | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function ConsultationPage() {
  const turnstileSiteKey = getCaptchaMode() === "turnstile"
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
    : undefined;

  // The 3 consent-step wordings are configurable legal text (project brief
  // section 2), edited with version history at /dashboard/legal-content -
  // see StepConsent.tsx for where each is rendered.
  const documents = await getRuntimeLegalTextDocuments();
  const wording = (key: LegalTextDocumentKey) => documents.find((document) => document.documentKey === key)?.content ?? "";

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
          <ConsultationForm
            turnstileSiteKey={turnstileSiteKey}
            contactConsentWording={wording("contact_permission_wording")}
            partnerSharingConsentWording={wording("consent_wording")}
            marketingConsentWording={wording("marketing_wording")}
          />
        </Suspense>
      </div>
    </Section>
  );
}
