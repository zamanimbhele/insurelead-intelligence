import { Section, SectionHeading } from "@/components/ui/Section";
import { CheckCircle2 } from "lucide-react";

const CHECKLIST_ITEMS = [
  "Do you know your total insured value for property, stock, and equipment?",
  "Have you reviewed your public liability limits in the last 12 months?",
  "Are all business vehicles correctly covered for commercial use?",
  "Would your business survive an interruption of 1-3 months?",
  "Do you handle client data that could be exposed in a cyber incident?",
  "Are contractors or sub-contractors covered while working on client sites?",
  "Is your cover aligned to your business's financial year-end?",
  "Have your employee numbers changed since your policy was last reviewed?",
];

export function Checklist() {
  return (
    <Section className="bg-slate-50">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading eyebrow="Self-Assessment" title="Business Insurance Checklist" />
          <p className="mt-4 text-slate-600">
            Answering &quot;no&quot; or &quot;not sure&quot; to any of these is a good reason to request a consultation with a licensed
            broker.
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
