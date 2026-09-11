import { Section, SectionHeading } from "@/components/ui/Section";
import { InsuranceCategories } from "@/components/site/InsuranceCategories";
import { LinkButton } from "@/components/ui/Button";

export const metadata = { title: "Insurance Products | InsureLead Intelligence" };

export default function SolutionsPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Solutions"
          title="Insurance Products"
          description="Explore personal and business product categories, then submit one consent-aware enquiry for a relevant participating broker to review."
        />
      </Section>
      <InsuranceCategories />
      <Section className="bg-slate-50 text-center">
        <LinkButton href="/consultation">Find Insurance Options</LinkButton>
      </Section>
    </>
  );
}
