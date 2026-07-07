import { Section, SectionHeading } from "@/components/ui/Section";
import { IndustryCategories } from "@/components/site/IndustryCategories";
import { LinkButton } from "@/components/ui/Button";

export const metadata = { title: "Industry Solutions | InsureLead Intelligence" };

export default function IndustriesPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Industries"
          title="Industry Solutions"
          description="Business insurance needs vary widely by sector. Let us know your industry so a broker can prepare relevant options ahead of contacting you."
        />
      </Section>
      <IndustryCategories />
      <Section className="text-center">
        <LinkButton href="/consultation">Request a Business Insurance Consultation</LinkButton>
      </Section>
    </>
  );
}
