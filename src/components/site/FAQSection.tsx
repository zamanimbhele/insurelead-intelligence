"use client";
import { useState } from "react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const FAQ_ITEMS = [
  {
    q: "Who is InsureLead built for?",
    a: "InsureLead is built for approved insurance brokers and platform teams that need product-specific lead generation, campaign oversight, controlled allocation, and a dedicated lead-management workspace.",
  },
  {
    q: "How do brokers request leads?",
    a: "A broker defines the products, geographic coverage, audience criteria, and expected lead volume. The platform team can then prepare a campaign that reflects the broker's approved appetite and capacity.",
  },
  {
    q: "How are leads generated and delivered?",
    a: "InsureLead deploys targeted campaign experiences, captures consented responses, evaluates transparent quality signals, and delivers matched leads to the broker's access-controlled dashboard.",
  },
  {
    q: "Can a broker choose specific products or markets?",
    a: "Yes. Campaign requirements can be aligned to approved insurance products, locations, customer types, business industries, and operational lead capacity.",
  },
  {
    q: "Does InsureLead make insurance or underwriting decisions?",
    a: "No. Lead scores support internal prioritisation only. Appropriately authorised human brokers remain responsible for customer engagement, advice, quotations, and underwriting processes.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <Section>
      <SectionHeading eyebrow="Broker FAQs" title="Questions About the Platform" center />
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
