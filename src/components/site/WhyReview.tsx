import { Section, SectionHeading } from "@/components/ui/Section";
import { CalendarClock, TrendingUp, ShieldQuestion } from "lucide-react";

const REASONS = [
  {
    icon: CalendarClock,
    title: "Your business has changed",
    description: "Headcount, turnover, equipment, premises, or contracts have changed since your cover was last reviewed.",
  },
  {
    icon: TrendingUp,
    title: "Your risk exposure has grown",
    description: "New clients, new locations, or new digital systems can introduce risks your existing cover may not address.",
  },
  {
    icon: ShieldQuestion,
    title: "You're not sure what you're covered for",
    description: "Many businesses are unclear on the difference between public liability, business interruption, and other cover types.",
  },
];

export function WhyReview() {
  return (
    <Section>
      <SectionHeading eyebrow="Insurance Reviews" title="Why Review Your Business Insurance?" />
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
