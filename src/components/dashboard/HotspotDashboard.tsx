"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, MapPin } from "lucide-react";
import type { GeoHotspot, HotspotLevel } from "@/lib/types";
import { MAX_HOTSPOT_THRESHOLD, MIN_HOTSPOT_THRESHOLD } from "@/lib/constants";

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

const LEVEL_LABELS: Record<HotspotLevel, { title: string; emptyLabel: string }> = {
  province: { title: "By Province", emptyLabel: "No province meets the minimum lead volume yet." },
  municipality: { title: "By Municipality", emptyLabel: "No municipality meets the minimum lead volume yet." },
  suburb: { title: "By Suburb", emptyLabel: "No suburb meets the minimum lead volume yet." },
};

function HotspotTable({ level, hotspots }: { level: HotspotLevel; hotspots: GeoHotspot[] }) {
  const { title, emptyLabel } = LEVEL_LABELS[level];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid={`hotspot-table-${level}`}>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hotspots.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400" data-testid={`hotspot-empty-${level}`}>
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4">Area</th>
                <th className="py-2 pr-4">Leads</th>
                <th className="py-2 pr-4">Growth</th>
                <th className="py-2 pr-4">Conversion</th>
                <th className="py-2 pr-4">Top industry</th>
                <th className="py-2 pr-4">Top need</th>
                <th className="py-2 pr-4">Top campaign</th>
                <th className="py-2 pr-4">Opportunity score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hotspots.map((hotspot) => (
                <tr key={hotspot.label} title={hotspot.opportunityExplanation}>
                  <td className="py-2 pr-4 font-medium text-slate-700">{hotspot.label}</td>
                  <td className="py-2 pr-4 text-slate-600">{hotspot.leadVolume}</td>
                  <td className="py-2 pr-4 text-slate-600">{formatPercent(hotspot.growthRate)}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {hotspot.conversionRate === null ? "No closed leads yet" : formatPercent(hotspot.conversionRate)}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{hotspot.topIndustry ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-600">{hotspot.topInsuranceNeed ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-600">{hotspot.topCampaignSource ?? "-"}</td>
                  <td className="py-2 pr-4">
                    <span
                      data-testid={`hotspot-score-${level}`}
                      className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700"
                    >
                      {hotspot.opportunityScore}/100
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-400">
            Computed as of {format(new Date(hotspots[0].computedAt), "d MMM yyyy, HH:mm")}. Hover a score for its
            explanation.
          </p>
        </div>
      )}
    </div>
  );
}

function ThresholdSettingCard({ minLeadThreshold }: { minLeadThreshold: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(minLeadThreshold));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < MIN_HOTSPOT_THRESHOLD || parsed > MAX_HOTSPOT_THRESHOLD) {
      setError(`Enter a whole number between ${MIN_HOTSPOT_THRESHOLD} and ${MAX_HOTSPOT_THRESHOLD}`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/market-intelligence/hotspot-threshold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotspotMinLeadThreshold: parsed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The hotspot threshold could not be updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The hotspot threshold could not be updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="hotspot-threshold-card">
      <h2 className="text-sm font-semibold text-slate-900">Minimum lead volume to display an area</h2>
      <p className="mt-1 text-xs text-slate-500">
        An area with fewer leads than this is never shown above, at any level. Changing it applies immediately.
      </p>
      <div className="mt-4 flex items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Leads
          <input
            type="number"
            min={MIN_HOTSPOT_THRESHOLD}
            max={MAX_HOTSPOT_THRESHOLD}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function HotspotDashboard({
  province,
  municipality,
  suburb,
  minLeadThreshold,
  canManage,
}: {
  province: GeoHotspot[];
  municipality: GeoHotspot[];
  suburb: GeoHotspot[];
  minLeadThreshold: number;
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <ThresholdSettingCard minLeadThreshold={minLeadThreshold} />
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5" /> Minimum lead volume to display an area: {minLeadThreshold}
        </div>
      )}
      <HotspotTable level="province" hotspots={province} />
      <HotspotTable level="municipality" hotspots={municipality} />
      <HotspotTable level="suburb" hotspots={suburb} />
    </div>
  );
}
