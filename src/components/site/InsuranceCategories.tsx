import { Section, SectionHeading } from "@/components/ui/Section";
import { INSURANCE_PRODUCTS } from "@/lib/constants";
import { ArrowRight, Car, ShieldAlert, Briefcase, Plane, HeartPulse, House, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const ICONS: Record<string, LucideIcon> = {
  motor_insurance: Car,
  home_contents_insurance: House,
  life_insurance: HeartPulse,
  funeral_cover: ShieldAlert,
  travel_insurance: Plane,
  personal_accident: HeartPulse,
  business_insurance: Briefcase,
  general_insurance_review: ClipboardList,
};

const LEAD_DESCRIPTIONS: Record<string, string> = {
  motor_insurance: "Reach drivers and vehicle owners who have expressed interest in motor cover.",
  home_contents_insurance: "Receive product-matched enquiries from homeowners and household decision-makers.",
  life_insurance: "Connect with prospects considering protection for the people who depend on them.",
  funeral_cover: "Reach consented prospects exploring funeral cover for themselves or their families.",
  travel_insurance: "Target travellers considering domestic or international travel protection.",
  personal_accident: "Connect with prospects interested in specified accidental injury protection.",
  business_insurance: "Reach business owners seeking conversations about commercial risks and cover options.",
  general_insurance_review: "Receive broader review enquiries that may span more than one insurance product.",
};

export function InsuranceCategories() {
  return (
    <Section id="lead-categories">
      <SectionHeading
        eyebrow="Lead Categories"
        title="Leads Across Multiple Insurance Products"
        description="Choose the product categories that match your broker appetite. Each campaign can be aligned to your market, location, and lead-volume requirements."
      />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {INSURANCE_PRODUCTS.map((p) => {
          const Icon = ICONS[p.value] ?? ShieldAlert;
          return (
            <Link key={p.value} href="/dashboard/campaigns" className="group rounded-xl border border-slate-200 p-5 transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{p.label}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{LEAD_DESCRIPTIONS[p.value] ?? p.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                Request these leads <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
