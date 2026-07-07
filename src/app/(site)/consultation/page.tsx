import { Suspense } from "react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { ConsultationForm } from "@/components/forms/ConsultationForm";

export const metadata = { title: "Request a Business Insurance Consultation | InsureLead Intelligence" };

export default function ConsultationPage() {
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
          <ConsultationForm />
        </Suspense>
      </div>
    </Section>
  );
}
