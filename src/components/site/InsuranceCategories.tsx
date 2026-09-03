import { Section, SectionHeading } from "@/components/ui/Section";
import { INSURANCE_PRODUCTS } from "@/lib/constants";
import { Car, ShieldAlert, Building2, HardHat, Briefcase, TrendingDown, Wifi, Boxes, Users, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  commercial_motor: Car,
  public_liability: ShieldAlert,
  property_and_contents: Building2,
  contractors_all_risk: HardHat,
  professional_indemnity: Briefcase,
  business_interruption: TrendingDown,
  cyber_insurance: Wifi,
  stock_equipment_machinery: Boxes,
  employee_related_cover: Users,
  general_review_or_comparison: ClipboardList,
};

export function InsuranceCategories() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Cover Categories"
        title="Business Insurance Solutions"
        description="Tell us which categories are relevant to your business - you can select more than one."
      />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {INSURANCE_PRODUCTS.map((p) => {
          const Icon = ICONS[p.value] ?? ShieldAlert;
          return (
            <div key={p.value} className="rounded-xl border border-slate-200 p-5 transition-shadow hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{p.label}</h3>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
