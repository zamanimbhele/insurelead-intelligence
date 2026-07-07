"use client";
import { useState } from "react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const FAQ_ITEMS = [
  {
    q: "Does submitting this form create an insurance policy or a binding quote?",
    a: "No. Submitting an enquiry only registers your interest in a business insurance consultation. No cover, quote, or policy is created until a licensed broker has engaged with you directly and you have agreed to proceed.",
  },
  {
    q: "Who will contact me after I submit my details?",
    a: "A broker from the relevant team will reach out using your preferred contact channel and time, based on the consent you provide in the form.",
  },
  {
    q: "How is my information used?",
    a: "Your information is used only to respond to your enquiry and, where you've given optional marketing consent, to share relevant business insurance information. See our Privacy Notice for full details.",
  },
  {
    q: "Can I ask you to stop contacting me?",
    a: "Yes. Every communication includes an opt-out option, and you can request to be marked Do Not Contact at any time via our Contact Us page.",
  },
  {
    q: "Do you provide insurance advice automatically on this website?",
    a: "No. This platform does not generate automated advice, premiums, or underwriting decisions. All recommendations are made by a licensed human broker.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <Section>
      <SectionHeading eyebrow="Support" title="Frequently Asked Questions" center />
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-slate-200 rounded-xl border border-slate-200">
        {FAQ_ITEMS.map((item, idx) => (
          <div key={item.q} className="p-5">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
            >
              <span className="text-sm font-semibold text-slate-900">{item.q}</span>
              <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-slate-500 transition-transform", openIndex === idx && "rotate-180")} />
            </button>
            {openIndex === idx && <p className="mt-3 text-sm text-slate-600">{item.a}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}
