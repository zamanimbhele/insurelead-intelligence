"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  Archive,
  Database,
  Download,
  UserMinus,
  UserCog,
  Loader2,
} from "lucide-react";
import { StatCard } from "./StatCard";
import { ComplianceRequestsPanel } from "./ComplianceRequestsPanel";
import { LEAD_STATUS_LABELS, MAX_LEAD_RETENTION_DAYS, MIN_LEAD_RETENTION_DAYS } from "@/lib/constants";
import type { ComplianceLeadSummary, ComplianceOverview } from "@/lib/dashboard-data";

function LeadExceptionCard({
  title,
  description,
  leads,
  totalCount,
  emptyLabel,
}: {
  title: string;
  description: string;
  leads: ComplianceLeadSummary[];
  totalCount: number;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      {leads.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {leads.map((lead) => (
            <li key={lead.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/dashboard/leads/${lead.id}`} className="truncate font-medium text-slate-700 hover:text-primary-700 hover:underline">
                {lead.displayName}
              </Link>
              <span className="flex-shrink-0 text-xs text-slate-400">
                {LEAD_STATUS_LABELS[lead.status] ?? lead.status} · {format(new Date(lead.createdAt), "d MMM yyyy")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {totalCount > leads.length && (
        <p className="mt-3 text-xs text-slate-400">Showing {leads.length} of {totalCount}. Open Leads and filter for the full list.</p>
      )}
    </div>
  );
}

function PlaceholderCard({
  icon: Icon,
  title,
  description,
  backlogItem,
}: {
  icon: typeof Database;
  title: string;
  description: string;
  backlogItem: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Planned
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
      <p className="mt-3 text-xs font-medium text-slate-400">Backlog: {backlogItem}</p>
    </div>
  );
}

function RetentionSettingCard({ thresholdDays, canManage }: { thresholdDays: number; canManage: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(thresholdDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedValue, setSavedValue] = useState(thresholdDays);

  async function save() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < MIN_LEAD_RETENTION_DAYS || parsed > MAX_LEAD_RETENTION_DAYS) {
      setError(`Enter a whole number of days between ${MIN_LEAD_RETENTION_DAYS} and ${MAX_LEAD_RETENTION_DAYS}`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/compliance/retention-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadRetentionDays: parsed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The retention setting could not be updated");
      setSavedValue(parsed);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The retention setting could not be updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="retention-setting-card" className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-900">Retention threshold</h3>
      <p className="mt-1 text-xs text-slate-500">
        Leads older than this, and not yet archived, are flagged above as retention exceptions for compliance review.
      </p>
      {canManage ? (
        <div className="mt-4 flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Days
            <input
              type="number"
              min={MIN_LEAD_RETENTION_DAYS}
              max={MAX_LEAD_RETENTION_DAYS}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="w-28 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || Number(value) === savedValue}
            className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      ) : (
        <p className="mt-4 text-2xl font-bold text-slate-900">{thresholdDays} days</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!canManage && <p className="mt-2 text-xs text-slate-400">Only a platform or compliance administrator can change this.</p>}
    </div>
  );
}

export function ComplianceDashboard({ overview, canManage }: { overview: ComplianceOverview; canManage: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          testId="stat-consent-coverage"
          label="Consent Coverage"
          value={`${overview.consent.coveragePct}%`}
          icon={ShieldCheck}
          accent={overview.consent.coveragePct === 100 ? "primary" : "amber"}
        />
        <StatCard
          testId="stat-invalid-consent"
          label="Without Valid Consent"
          value={overview.consent.invalidCount}
          icon={ShieldOff}
          accent={overview.consent.invalidCount > 0 ? "red" : "slate"}
        />
        <StatCard
          testId="stat-do-not-contact"
          label="Do Not Contact"
          value={overview.doNotContact.count}
          icon={ShieldOff}
          accent="slate"
        />
        <StatCard
          testId="stat-unassigned"
          label="Unassigned"
          value={overview.unassigned.count}
          icon={AlertTriangle}
          accent={overview.unassigned.count > 0 ? "amber" : "slate"}
        />
        <StatCard
          testId="stat-retention-exceptions"
          label="Retention Exceptions"
          value={overview.retentionExceptions.count}
          icon={Archive}
          accent={overview.retentionExceptions.count > 0 ? "red" : "slate"}
        />
        <StatCard
          testId="stat-new-opt-outs"
          label="New Opt-Out Requests"
          value={overview.optOuts.newCount}
          icon={UserMinus}
          accent={overview.optOuts.newCount > 0 ? "amber" : "slate"}
        />
        <StatCard
          testId="stat-data-subject-requests"
          label="Open Data Subject Requests"
          value={overview.dataSubjectRequests.openCount}
          icon={UserCog}
          accent={overview.dataSubjectRequests.overdueCount > 0 ? "red" : overview.dataSubjectRequests.openCount > 0 ? "amber" : "slate"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <LeadExceptionCard
          title="Leads without valid consent"
          description="Missing one or more of the five required consent checks (privacy notice, contact, partner sharing, accuracy, non-binding acknowledgement), or no consent record at all. The public form enforces all five, so this should normally be empty."
          leads={overview.consent.invalidLeads}
          totalCount={overview.consent.invalidCount}
          emptyLabel="None - every lead has a complete, valid consent record."
        />
        <LeadExceptionCard
          title="Do Not Contact"
          description="Flagged leads are blocked from the Kanban board and status API from re-entering outreach, but are not yet enforced on campaign/notification surfaces (see BACKLOG.md)."
          leads={overview.doNotContact.leads}
          totalCount={overview.doNotContact.count}
          emptyLabel="No leads are currently flagged Do Not Contact."
        />
        <LeadExceptionCard
          title="Unassigned leads"
          description="Not in a terminal status (won, lost, archived, do not contact) and with no reserved, accepted, or disputed broker allocation."
          leads={overview.unassigned.leads}
          totalCount={overview.unassigned.count}
          emptyLabel="Every active lead is routed to a broker organisation."
        />
        <LeadExceptionCard
          title="Retention exceptions"
          description={`Created more than ${overview.retentionThresholdDays} days ago and not yet archived.`}
          leads={overview.retentionExceptions.leads}
          totalCount={overview.retentionExceptions.count}
          emptyLabel="No active leads have exceeded the retention threshold."
        />
      </div>

      <RetentionSettingCard thresholdDays={overview.retentionThresholdDays} canManage={canManage} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Opt-outs &amp; data subject requests</h2>
        <ComplianceRequestsPanel
          optOutRequests={overview.optOuts.requests}
          dataSubjectRequests={overview.dataSubjectRequests.requests}
          canManage={canManage}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Data source approvals</h2>
        <div data-testid="data-source-registry-card" className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Every source of business or contact information the platform uses, with its legal basis, consent status,
              and approved use recorded before any import is allowed.
            </p>
            <Link href="/dashboard/data-sources" className="flex-shrink-0 text-xs font-semibold text-primary-700 hover:underline">
              Open registry
            </Link>
          </div>
          {overview.dataSourceRegistry.totalCount === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No data sources have been registered yet.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span data-testid="data-source-pending-count" className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-700">
                {overview.dataSourceRegistry.pendingCount} pending review
              </span>
              <span className="rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-700">
                {overview.dataSourceRegistry.approvedCount} approved
              </span>
              <span className="rounded-lg bg-red-50 px-3 py-2 font-medium text-red-700">
                {overview.dataSourceRegistry.rejectedCount} rejected
              </span>
              <span className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-600">
                {overview.dataSourceRegistry.suspendedCount} suspended
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Not yet available</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <PlaceholderCard
            icon={Download}
            title="Export activity"
            description="Who exported what, when, with which filters, and how many records - role-restricted and fully audited."
            backlogItem="Role-restricted, audited CSV/report exports"
          />
        </div>
      </div>
    </div>
  );
}
