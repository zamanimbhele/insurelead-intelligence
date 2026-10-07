import type { AuditLogEntry } from "./types";

/**
 * Pure helpers for the Audit Log Viewer (project brief Phase 5: "Audit log
 * viewer"). Filtering and CSV rendering both live here, shared by the
 * viewer page (filters an already-fetched page client-side for a fast UI)
 * and the export route (re-applies the exact same filters server-side
 * against a fresh fetch, so what gets exported is never just "whatever the
 * client happened to have in memory").
 */

export interface AuditLogFilters {
  entity?: AuditLogEntry["entity"];
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
}

export function filterAuditLog(entries: AuditLogEntry[], filters: AuditLogFilters): AuditLogEntry[] {
  const action = filters.action?.trim().toLowerCase();
  const actor = filters.actor?.trim().toLowerCase();
  const from = filters.from ? new Date(filters.from).getTime() : undefined;
  // "to" is a date picker value (a day, not a timestamp) - treat it as the
  // end of that day so a same-day entry is included, not excluded by a
  // midnight-vs-midnight comparison.
  const to = filters.to ? new Date(filters.to).getTime() + (24 * 60 * 60 * 1000 - 1) : undefined;

  return entries.filter((entry) => {
    if (filters.entity && entry.entity !== filters.entity) return false;
    if (action && !entry.action.toLowerCase().includes(action)) return false;
    if (actor && !entry.actor.toLowerCase().includes(actor)) return false;
    const entryTime = new Date(entry.timestamp).getTime();
    if (from !== undefined && entryTime < from) return false;
    if (to !== undefined && entryTime > to) return false;
    return true;
  });
}

const CSV_COLUMNS = ["timestamp", "entity", "entityId", "action", "actor", "details"] as const;

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Includes the export metadata the project brief requires on every export
// (section 12: "Exported by, Export date, Report filters, Number of
// records, Audit-log reference") as a small header block before the CSV
// table itself, rather than only logging that metadata out of sight in
// audit_logs - the file is self-describing even if it is forwarded on.
export function auditLogToCsv(
  entries: AuditLogEntry[],
  meta: { exportedBy: string; exportedAt: string; filters: AuditLogFilters; auditLogReference: string },
): string {
  const filterSummary =
    Object.entries(meta.filters)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ") || "none";

  const metaLines = [
    `# Exported by: ${csvField(meta.exportedBy)}`,
    `# Export date: ${meta.exportedAt}`,
    `# Filters: ${csvField(filterSummary)}`,
    `# Number of records: ${entries.length}`,
    `# Audit-log reference: ${meta.auditLogReference}`,
  ];

  const header = CSV_COLUMNS.join(",");
  const rows = entries.map((entry) =>
    CSV_COLUMNS.map((column) => csvField(String(entry[column] ?? ""))).join(","),
  );

  return [...metaLines, "", header, ...rows].join("\n");
}
