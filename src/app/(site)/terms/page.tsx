import { Section, SectionHeading } from "@/components/ui/Section";

export const metadata = { title: "Terms of Use | InsureLead Intelligence" };

export default function TermsPage() {
  return (
    <Section>
      <SectionHeading eyebrow="Legal" title="Terms of Use" />
      <div className="prose mt-8 max-w-3xl space-y-4 text-sm text-slate-600">
        <p>Version: v1.0 - Last updated 7 July 2026 (placeholder - to be reviewed by Compliance Admin).</p>
        <p>
          By submitting the enquiry form, you confirm that the information provided is accurate to the best of your
          knowledge and, for a business enquiry, that you are authorised to submit it for the business named.
        </p>
        <p>
          Submitting an enquiry through this Platform does not create insurance cover, a binding quote, financial
          advice, or any contractual relationship. Any recommendations, quotes, or advice will only be provided
          directly by a licensed broker following review of your enquiry.
        </p>
        <p>
          Financial services provider details and relevant product permissions will be displayed for each
          participating broker once configured by an authorised administrator.
        </p>
      </div>
    </Section>
  );
}
