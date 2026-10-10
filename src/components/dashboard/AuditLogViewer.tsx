"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import type { AuditLogEntry } from "@/lib/types";
import { filterAuditLog, type AuditLogFilters } from "@/lib/audit-log";

const ENTITY_LABELS: Record<AuditLogEntry["entity"], string> = {
  lead: "Lead",
  consent: "Consent",
  assignment: "Assignment",
  status: "Status",
  campaign: "Campaign",
  suppression: "Suppression",
  settings: "Settings",
  note: "Note",
  task: "Task",
  opt_out: "Opt-out",
  data_subject_request: "Data subject request",
  data_source: "Data source",
  fye_campaign_plan: "FYE campaign plan",
  export: "Export",
  legal_text: "Legal text",
  demo_data: "Demo data reset",
};

const ENTITY_OPTIONS = Object.entries(ENTITY_LABELS) as [AuditLogEntry["entity"], string][];

export function AuditLogViewer({ entries, canExport }: { entries: AuditLogEntry[]; canExport: boolean }) {
  const [entity, setEntity] = useState<AuditLogEntry["entity"] | "">("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filters: AuditLogFilters = useMemo(
    () => ({
      entity: entity || undefined,
      action: action || undefined,
      actor: actor || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [entity, action, actor, from, to],
  );

  const filtered = useMemo(() => filterAuditLog(entries, filters), [entries, filters]);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch("/api/audit-log/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "The audit log could not be exported");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-log-export-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "The audit log could not be exported");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="audit-log-filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Entity
            <select
              data-testid="audit-log-filter-entity"
              value={entity}
              onChange={(event) => setEntity(event.target.value as AuditLogEntry["entity"] | "")}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            >
              <option value="">All</option>
              {ENTITY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Action contains
            <input
              data-testid="audit-log-filter-action"
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Actor contains
            <input
              data-testid="audit-log-filter-actor"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            From
            <input
              type="date"
              data-testid="audit-log-filter-from"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              data-testid="audit-log-filter-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
        </div>
        {canExport ? (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting}
              data-testid="audit-log-export-button"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export filtered CSV
            </button>
            <span className="text-xs text-slate-500">{filtered.length} matching entries</span>
          </div>
        ) : null}
        {exportError ? <p className="mt-2 text-xs text-red-600">{exportError}</p> : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="audit-log-table">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400" data-testid="audit-log-empty">
            No audit log entries match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th scope="col" className="py-2 pr-4">When</th>
                  <th scope="col" className="py-2 pr-4">Entity</th>
                  <th scope="col" className="py-2 pr-4">Action</th>
                  <th scope="col" className="py-2 pr-4">Actor</th>
                  <th scope="col" className="py-2 pr-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={entry.id} data-testid="audit-log-row">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-600">
                      {format(new Date(entry.timestamp), "d MMM yyyy, HH:mm")}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{ENTITY_LABELS[entry.entity] ?? entry.entity}</td>
                    <td className="py-2 pr-4 font-medium text-slate-700">{entry.action}</td>
                    <td className="py-2 pr-4 text-slate-600">{entry.actor}</td>
                    <td className="py-2 pr-4 text-slate-500">{entry.details ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
