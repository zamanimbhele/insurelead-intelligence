import { Section, SectionHeading } from "@/components/ui/Section";
import { CheckCircle2 } from "lucide-react";

const CHECKLIST_ITEMS = [
  "Choose the products, regions, customer profiles, and lead volumes you want to target.",
  "InsureLead prepares and deploys a campaign aligned to your approved broker appetite.",
  "Customer responses are captured with consent and assessed against transparent quality signals.",
  "Matched, scored leads are delivered to your secure broker dashboard for follow-up.",
];

export function Checklist() {
  return (
    <Section id="how-it-works" className="bg-slate-50 scroll-mt-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading eyebrow="How It Works" title="From Lead Request to Broker Dashboard" />
          <p className="mt-4 text-slate-600">
            You define the opportunity you want to pursue. InsureLead manages the campaign, enquiry capture,
            quality scoring, and controlled delivery workflow.
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
