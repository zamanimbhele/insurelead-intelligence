import { Section, SectionHeading } from "@/components/ui/Section";
import { CalendarClock, TrendingUp, ShieldQuestion } from "lucide-react";

const REASONS = [
  {
    icon: CalendarClock,
    title: "Your circumstances have changed",
    description: "A move, new vehicle, growing family, new assets, or changes in your business can affect the cover you need.",
  },
  {
    icon: TrendingUp,
    title: "Your risks have changed",
    description: "New responsibilities, locations, equipment, travel, or digital activity can create different insurance needs.",
  },
  {
    icon: ShieldQuestion,
    title: "You're not sure what you're covered for",
    description: "A participating broker can explain relevant options without InsureLead making an automated recommendation.",
  },
];

export function WhyReview() {
  return (
    <Section>
      <SectionHeading eyebrow="Insurance Reviews" title="Why Review Your Insurance Needs?" />
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
