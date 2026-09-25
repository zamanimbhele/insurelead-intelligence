import { Section, SectionHeading } from "@/components/ui/Section";
import { INDUSTRIES } from "@/lib/constants";
import { BarChart3, MapPin, SlidersHorizontal, Users } from "lucide-react";

const CAMPAIGN_CONTROLS = [
  { icon: SlidersHorizontal, title: "Product targeting", text: "Focus each campaign on the insurance products you are approved and ready to sell." },
  { icon: MapPin, title: "Geographic targeting", text: "Prioritise the provinces, cities, or service areas covered by your broker team." },
  { icon: Users, title: "Audience targeting", text: "Align messaging to relevant customer types, business profiles, and industry segments." },
  { icon: BarChart3, title: "Capacity controls", text: "Set lead-volume expectations so allocation reflects your team’s follow-up capacity." },
];

export function IndustryCategories() {
  return (
    <Section id="campaigns" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Campaign Management"
        title="Campaigns Built Around Your Broker Appetite"
        description="Define what you sell, where you operate, who you want to reach, and how many leads your team can manage."
      />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CAMPAIGN_CONTROLS.map((item) => (
          <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <item.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-10 text-sm font-semibold text-slate-900">Business campaigns can also be refined by industry:</p>
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
