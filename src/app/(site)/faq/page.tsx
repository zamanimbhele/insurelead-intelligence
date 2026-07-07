import { Section, SectionHeading } from "@/components/ui/Section";
import { FAQSection } from "@/components/site/FAQSection";

export const metadata = { title: "FAQs | InsureLead Intelligence" };

export default function FAQPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading eyebrow="Support" title="Frequently Asked Questions" />
      </Section>
      <FAQSection />
    </>
  );
}
