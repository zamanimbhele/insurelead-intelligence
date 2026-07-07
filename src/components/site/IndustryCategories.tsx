import { Section, SectionHeading } from "@/components/ui/Section";
import { INDUSTRIES } from "@/lib/constants";

export function IndustryCategories() {
  return (
    <Section className="bg-slate-50">
      <SectionHeading
        eyebrow="Industry Focus"
        title="Solutions Across South African Industries"
        description="Business insurance needs differ by sector. Let us know your industry so a broker can prepare relevant options before contacting you."
      />
      <div className="mt-10 flex flex-wrap gap-3">
        {INDUSTRIES.map((industry) => (
          <span
            key={industry}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            {industry}
          </span>
        ))}
      </div>
    </Section>
  );
}
