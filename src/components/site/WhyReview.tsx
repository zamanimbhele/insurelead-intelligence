import { Section, SectionHeading } from "@/components/ui/Section";
import { Gauge, Megaphone, PanelsTopLeft } from "lucide-react";

const REASONS = [
  {
    icon: Megaphone,
    title: "Campaign execution without the overhead",
    description: "Request a product-specific campaign without assembling separate landing pages, intake tools, and routing workflows.",
  },
  {
    icon: Gauge,
    title: "Quality signals before follow-up",
    description: "Prioritise leads using transparent scores, consent status, product interest, and allocation context.",
  },
  {
    icon: PanelsTopLeft,
    title: "One broker workspace",
    description: "Track campaigns, allocations, lead status, follow-up activity, and market signals from a dedicated dashboard.",
  },
];

export function WhyReview() {
  return (
    <Section id="why-insurelead" className="bg-slate-50 scroll-mt-24">
      <SectionHeading eyebrow="Why InsureLead" title="A Clearer Route From Campaign to Conversion" />
      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        {REASONS.map((r) => (
          <div key={r.title}>
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary-50 text-secondary-600">
              <r.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-slate-900">{r.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{r.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
