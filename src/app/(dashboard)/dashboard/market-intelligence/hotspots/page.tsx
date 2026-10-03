import { Info } from "lucide-react";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { getApplicationSettings, getGeoHotspots } from "@/lib/dashboard-data";
import { HotspotDashboard } from "@/components/dashboard/HotspotDashboard";

export const metadata = { title: "Geographic Hotspots | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function HotspotsPage() {
  const identity = await getDashboardIdentity();
  const [province, municipality, suburb, settings] = await Promise.all([
    getGeoHotspots("province"),
    getGeoHotspots("municipality"),
    getGeoHotspots("suburb"),
    getApplicationSettings(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Geographic Hotspots</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Aggregated opportunity by province, municipality, and suburb - computed only from leads this platform has
          already captured through its own consented intake. No scraped or third-party location data is used.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          An area is never shown here until it reaches the minimum lead volume below, so a small, potentially
          identifiable location is never exposed through this dashboard.
        </span>
      </div>

      <HotspotDashboard
        province={province}
        municipality={municipality}
        suburb={suburb}
        minLeadThreshold={settings.hotspotMinLeadThreshold}
        canManage={canManageCompliance(identity)}
      />
    </div>
  );
}
