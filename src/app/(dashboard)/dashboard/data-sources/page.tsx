import { redirect } from "next/navigation";
import { canManageCompliance, canViewCompliance, getDashboardIdentity } from "@/lib/auth";
import { getDashboardDataSources } from "@/lib/dashboard-data";
import { DataSourceRegistry } from "@/components/dashboard/DataSourceRegistry";

export const metadata = { title: "Data Sources | InsureLead Intelligence" };
export const dynamic = "force-dynamic";

export default async function DataSourcesPage() {
  const identity = await getDashboardIdentity();
  if (!canViewCompliance(identity)) redirect("/access-denied");

  const dataSources = await getDashboardDataSources();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data Source Registry</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Every third-party or internal source of business or contact information used anywhere on the platform, with its
          legal basis, consent status, licence reference, retention period, and approved use recorded before anything is
          allowed to import from it. No automated scraping is supported - every source is registered manually here.
        </p>
      </div>
      <DataSourceRegistry dataSources={dataSources} canManage={canManageCompliance(identity)} />
    </div>
  );
}
