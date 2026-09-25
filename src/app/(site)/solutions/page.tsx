import { Section, SectionHeading } from "@/components/ui/Section";
import { InsuranceCategories } from "@/components/site/InsuranceCategories";
import { LinkButton } from "@/components/ui/Button";

export const metadata = { title: "Insurance Lead Categories | InsureLead Intelligence" };

export default function SolutionsPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Broker Solutions"
          title="Insurance Lead Categories"
          description="Choose the product categories that match your broker appetite, approved market, and follow-up capacity."
        />
      </Section>
      <InsuranceCategories />
      <Section className="bg-slate-50 text-center">
        <LinkButton href="/dashboard/campaigns">Request Product-Specific Leads</LinkButton>
      </Section>
    </>
  );
}
