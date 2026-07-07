import { Section, SectionHeading } from "@/components/ui/Section";
import { InsuranceCategories } from "@/components/site/InsuranceCategories";
import { LinkButton } from "@/components/ui/Button";

export const metadata = { title: "Business Insurance Solutions | InsureLead Intelligence" };

export default function SolutionsPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Solutions"
          title="Business Insurance Solutions"
          description="From commercial motor to cyber cover, tell us what you need and a licensed broker will follow up with relevant options - no automated pricing or advice."
        />
      </Section>
      <InsuranceCategories />
      <Section className="bg-slate-50 text-center">
        <LinkButton href="/consultation">Request a Business Insurance Consultation</LinkButton>
      </Section>
    </>
  );
}
