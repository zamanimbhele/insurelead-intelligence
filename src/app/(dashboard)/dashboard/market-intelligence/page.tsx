import Link from "next/link";
import { getDashboardLeads } from "@/lib/dashboard-data";
import { BarChartCard } from "@/components/dashboard/BarChartCard";
import { Building2, CalendarClock, MapPin, Info } from "lucide-react";
import { INSURANCE_PRODUCTS } from "@/lib/constants";

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

export default async function MarketIntelligencePage() {
  const leads = await getDashboardLeads();

  const byIndustry = countBy(leads, "industry").filter((d) => d.count >= MIN_AGGREGATION_THRESHOLD).slice(0, 8);
  const byProvince = countBy(leads, "province").filter((d) => d.count >= MIN_AGGREGATION_THRESHOLD).slice(0, 8);
  const byCampaign = countBy(leads, "campaignSource").slice(0, 6);

  const byProduct = INSURANCE_PRODUCTS.map((product) => ({
    name: product.label,
    count: leads.filter((lead) => lead.insuranceProducts.includes(product.value)).length,
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);

  const fyeMonths = countBy(leads, "financialYearEndMonth").sort((a, b) => b.count - a.count).slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Market Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Aggregated demand trends from internally captured leads only. No individual applicant or business is identifiable in
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
        <BarChartCard title="Lead Volume by Insurance Product" data={byProduct} />
        <BarChartCard title="Lead Volume by Campaign Source" data={byCampaign} />
        <BarChartCard title="Financial Year-End Distribution" data={fyeMonths} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MapPin className="h-4 w-4 text-primary-600" /> Geographic Hotspots
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          A dedicated hotspot dashboard breaks this down by province, municipality, and suburb, each with an
          opportunity score, growth rate, and conversion rate - and each still gated by the same minimum-volume
          threshold so a small, potentially identifiable area is never shown.
        </p>
        <Link
          href="/dashboard/market-intelligence/hotspots"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline"
        >
          Open Geographic Hotspots
        </Link>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Building2 className="h-4 w-4 text-primary-600" /> Industry Opportunity
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Highest-volume, fastest-growing, and best-converting industries, each with a renewal-urgency count, its
          most-requested cover need, and a transparent opportunity score - industries converting poorly or
          declining are flagged for marketing attention rather than left to blend in.
        </p>
        <Link
          href="/dashboard/market-intelligence/industries"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline"
        >
          Open Industry Opportunity
        </Link>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarClock className="h-4 w-4 text-primary-600" /> Financial Year-End Campaign Planner
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Not every business shares the same financial year-end - a 12-month calendar of already-captured leads by
          their own financial-year-end month, a results breakdown by sector and location, campaign reminders, and
          bulk broker follow-up task lists, all without assuming a single national cycle.
        </p>
        <Link
          href="/dashboard/market-intelligence/fye-planner"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline"
        >
          Open FYE Campaign Planner
        </Link>
      </section>
    </div>
  );
}
