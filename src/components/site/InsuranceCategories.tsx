import { Section, SectionHeading } from "@/components/ui/Section";
import { INSURANCE_PRODUCTS } from "@/lib/constants";
import { Car, ShieldAlert, Briefcase, Plane, HeartPulse, House, ClipboardList } from "lucide-react";
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

export function InsuranceCategories() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Insurance Products"
        title="Cover for Individuals and Businesses"
        description="Choose the products you want to explore. Your enquiry will only be shared within the partner limit you approve."
      />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {INSURANCE_PRODUCTS.map((p) => {
          const Icon = ICONS[p.value] ?? ShieldAlert;
          return (
            <Link key={p.value} href={`/consultation?product=${p.value}`} className="rounded-xl border border-slate-200 p-5 transition-shadow hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{p.label}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{p.description}</p>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
