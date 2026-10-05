import { format } from "date-fns";
import { AlertTriangle, Flame, TrendingUp, Trophy } from "lucide-react";
import type { IndustryOpportunity } from "@/lib/types";

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function CalloutCard({
  icon: Icon,
  label,
  industry,
  valueLabel,
}: {
  icon: typeof Flame;
  label: string;
  industry: IndustryOpportunity | undefined;
  valueLabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5 text-primary-600" /> {label}
      </div>
      {industry ? (
        <>
          <p className="mt-2 text-lg font-semibold text-slate-900">{industry.industry}</p>
          <p className="mt-1 text-sm text-slate-500">{valueLabel}</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
      )}
    </div>
  );
}

export function IndustryOpportunityDashboard({ industries }: { industries: IndustryOpportunity[] }) {
  const highestVolume = industries.length > 0 ? [...industries].sort((a, b) => b.leadVolume - a.leadVolume)[0] : undefined;
  const fastestGrowing = [...industries]
    .filter((i) => i.growthRate !== null)
    .sort((a, b) => (b.growthRate as number) - (a.growthRate as number))[0];
  const bestConverting = [...industries]
    .filter((i) => i.conversionRate !== null)
    .sort((a, b) => (b.conversionRate as number) - (a.conversionRate as number))[0];

  if (industries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="industry-empty">
        <p className="text-sm text-slate-400">No industry meets the minimum lead volume yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <CalloutCard
          icon={Flame}
          label="Highest volume"
          industry={highestVolume}
          valueLabel={highestVolume ? `${highestVolume.leadVolume} leads` : ""}
        />
        <CalloutCard
          icon={TrendingUp}
          label="Fastest growing"
          industry={fastestGrowing}
          valueLabel={fastestGrowing ? `${formatPercent(fastestGrowing.growthRate)} over the prior period` : ""}
        />
        <CalloutCard
          icon={Trophy}
          label="Best converting"
          industry={bestConverting}
          valueLabel={bestConverting ? `${formatPercent(bestConverting.conversionRate)} of closed leads` : ""}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="industry-table">
        <h2 className="text-sm font-semibold text-slate-900">All industries</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4">Industry</th>
                <th className="py-2 pr-4">Leads</th>
                <th className="py-2 pr-4">Growth</th>
                <th className="py-2 pr-4">Conversion</th>
                <th className="py-2 pr-4">Renewing soon</th>
                <th className="py-2 pr-4">Top cover need</th>
                <th className="py-2 pr-4">Attention</th>
                <th className="py-2 pr-4">Opportunity score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {industries.map((industry) => (
                <tr key={industry.industry} title={industry.opportunityExplanation}>
                  <td className="py-2 pr-4 font-medium text-slate-700">{industry.industry}</td>
                  <td className="py-2 pr-4 text-slate-600">{industry.leadVolume}</td>
                  <td className="py-2 pr-4 text-slate-600">{formatPercent(industry.growthRate)}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {industry.conversionRate === null ? "No closed leads yet" : formatPercent(industry.conversionRate)}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {industry.renewalDataCount === 0
                      ? "No renewal dates captured yet"
                      : `${industry.renewingSoonCount} of ${industry.renewalDataCount}`}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{industry.topCoverNeed ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {industry.needsMarketingAttention ? (
                      <span
                        data-testid="industry-attention-flag"
                        title={industry.attentionReason}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
                      >
                        <AlertTriangle className="h-3 w-3" /> Needs attention
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      data-testid="industry-opportunity-score"
                      className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700"
                    >
                      {industry.opportunityScore}/100
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-400">
            Computed as of {format(new Date(industries[0].computedAt), "d MMM yyyy, HH:mm")}. Hover a score or an
            attention flag for its explanation.
          </p>
        </div>
      </div>
    </div>
  );
}
