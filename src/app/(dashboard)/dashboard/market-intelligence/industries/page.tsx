import Link from "next/link";
import { Info } from "lucide-react";
import { getApplicationSettings, getIndustryOpportunities } from "@/lib/dashboard-data";
import { IndustryOpportunityDashboard } from "@/components/dashboard/IndustryOpportunityDashboard";

export const metadata = { title: "Industry Opportunity | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function IndustryOpportunityPage() {
  const [industries, settings] = await Promise.all([getIndustryOpportunities(), getApplicationSettings()]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Industry Opportunity</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Aggregated opportunity by industry - computed only from leads this platform has already captured through
          its own consented intake. No scraped or third-party industry data is used.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          An industry with fewer than {settings.hotspotMinLeadThreshold} leads is never shown below - the same
          minimum lead volume used by the{" "}
          <Link href="/dashboard/market-intelligence/hotspots" className="font-medium underline">
            Geographic Hotspots
          </Link>{" "}
          dashboard, editable from there.
        </span>
      </div>

      <IndustryOpportunityDashboard industries={industries} />
    </div>
  );
}
