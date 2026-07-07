import { getLeads } from "@/lib/demo-store";
import { BarChartCard } from "@/components/dashboard/BarChartCard";
import { MapPin, TrendingUp, Info } from "lucide-react";

export const metadata = { title: "Market Intelligence | InsureLead Intelligence" };

// Minimum lead volume before a geographic/industry breakdown is displayed.
// Prevents exposing low-volume or potentially identifiable data - configurable
// by a Super Admin in production (application_settings).
const MIN_AGGREGATION_THRESHOLD = 5;

function countBy<T>(items: T[], key: keyof T) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = String(item[key]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export default function MarketIntelligencePage() {
  const leads = getLeads();

  const byIndustry = countBy(leads, "industry").filter((d) => d.count >= MIN_AGGREGATION_THRESHOLD).slice(0, 8);
  const byProvince = countBy(leads, "province").filter((d) => d.count >= MIN_AGGREGATION_THRESHOLD).slice(0, 8);
  const byCampaign = countBy(leads, "campaignSource").slice(0, 6);

  const fyeMonths = countBy(leads, "financialYearEndMonth").sort((a, b) => b.count - a.count).slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Market Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Aggregated demand trends from internally captured leads only. No individual business is identifiable in
          this view, and any breakdown below the minimum data threshold ({MIN_AGGREGATION_THRESHOLD} leads) is
          suppressed.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          This module uses aggregated, internally generated lead data only. It is not used to track identifiable
          companies or individuals, and no scraped or unapproved third-party data is included.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BarChartCard title="Lead Volume by Industry" data={byIndustry} />
        <BarChartCard title="Lead Volume by Province" data={byProvince} />
        <BarChartCard title="Lead Volume by Campaign Source" data={byCampaign} />
        <BarChartCard title="Financial Year-End Distribution" data={fyeMonths} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MapPin className="h-4 w-4 text-primary-600" /> Hotspot &amp; Financial-Year-End Planning
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          The full platform adds a geographic hotspot dashboard (province, municipality, suburb - each gated by the
          same minimum-volume threshold), an industry opportunity dashboard, and a financial-year-end campaign
          planner with reminders and broker follow-up task lists. These are scoped in the Phase 2 backlog document
          delivered alongside this prototype.
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-primary-700">
          <TrendingUp className="h-3.5 w-3.5" /> Backlog: Hotspot Analysis, Industry Opportunity Dashboard, FYE Campaign Planner
        </div>
      </section>
    </div>
  );
}