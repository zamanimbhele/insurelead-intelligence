import { Section, SectionHeading } from "@/components/ui/Section";
import { CheckCircle2 } from "lucide-react";

const CHECKLIST_ITEMS = [
  "Choose whether the enquiry is for you, your household, or your business.",
  "Select one or more insurance products you want to explore.",
  "Tell us your preferred contact channel and the best time to reach you.",
  "Choose whether one partner or up to three approved partners may receive the enquiry.",
];

export function Checklist() {
  return (
    <Section className="bg-slate-50">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading eyebrow="How It Works" title="One Enquiry, Relevant Broker Options" />
          <p className="mt-4 text-slate-600">
            InsureLead captures your product interest and consent, then helps route the enquiry to brokers whose
            approved product appetite matches what you selected.
          </p>
        </div>
        <ul className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-lg bg-white p-4 shadow-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-500" />
              <span className="text-sm text-slate-700">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
