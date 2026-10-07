import { describe, expect, it } from "vitest";
import { auditLogToCsv, filterAuditLog } from "./audit-log";
import type { AuditLogEntry } from "./types";

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: `audit_${Math.random().toString(36).slice(2, 8)}`,
    entity: "lead",
    entityId: "lead_1",
    action: "lead_created",
    actor: "public_form",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("filterAuditLog", () => {
  const entries = [
    makeEntry({ entity: "lead", action: "lead_created", actor: "public_form", timestamp: "2026-01-10T00:00:00.000Z" }),
    makeEntry({ entity: "consent", action: "consent_recorded", actor: "public_form", timestamp: "2026-02-15T00:00:00.000Z" }),
    makeEntry({ entity: "export", action: "audit_log_exported", actor: "admin@example.com", timestamp: "2026-03-20T00:00:00.000Z" }),
  ];

  it("returns everything when no filters are given", () => {
    expect(filterAuditLog(entries, {})).toHaveLength(3);
  });

  it("filters by exact entity", () => {
    expect(filterAuditLog(entries, { entity: "consent" })).toEqual([entries[1]]);
  });

  it("filters by action as a case-insensitive substring", () => {
    expect(filterAuditLog(entries, { action: "CREATED" })).toEqual([entries[0]]);
  });

  it("filters by actor as a case-insensitive substring", () => {
    expect(filterAuditLog(entries, { actor: "ADMIN" })).toEqual([entries[2]]);
  });

  it("filters by an inclusive date range, including the entire 'to' day", () => {
    const result = filterAuditLog(entries, { from: "2026-01-01", to: "2026-02-28" });
    expect(result).toEqual([entries[0], entries[1]]);
  });

  it("excludes everything outside a narrow date range", () => {
    expect(filterAuditLog(entries, { from: "1999-01-01", to: "1999-01-02" })).toEqual([]);
  });

  it("combines multiple filters with AND semantics", () => {
    const result = filterAuditLog(entries, { entity: "lead", actor: "public_form" });
    expect(result).toEqual([entries[0]]);
    expect(filterAuditLog(entries, { entity: "lead", actor: "no-such-actor" })).toEqual([]);
  });
});

describe("auditLogToCsv", () => {
  const meta = {
    exportedBy: "admin@example.com",
    exportedAt: "2026-10-07T00:00:00.000Z",
    filters: { entity: "export" as const },
    auditLogReference: "audit_ref_123",
  };

  it("embeds a metadata header with exporter, date, filters, record count, and reference", () => {
    const csv = auditLogToCsv([makeEntry()], meta);
    expect(csv).toContain("# Exported by: admin@example.com");
    expect(csv).toContain("# Export date: 2026-10-07T00:00:00.000Z");
    expect(csv).toContain("# Filters: entity=export");
    expect(csv).toContain("# Number of records: 1");
    expect(csv).toContain("# Audit-log reference: audit_ref_123");
  });

  it("reports 'none' for the filter summary when no filters were applied", () => {
    const csv = auditLogToCsv([], { ...meta, filters: {} });
    expect(csv).toContain("# Filters: none");
    expect(csv).toContain("# Number of records: 0");
  });

  it("writes a header row and one data row per entry, in column order", () => {
    const entry = makeEntry({
      entity: "lead",
      entityId: "lead_42",
      action: "lead_created",
      actor: "public_form",
      timestamp: "2026-01-01T00:00:00.000Z",
      details: "simple detail",
    });
    const csv = auditLogToCsv([entry], meta);
    expect(csv).toContain("timestamp,entity,entityId,action,actor,details");
    expect(csv).toContain("2026-01-01T00:00:00.000Z,lead,lead_42,lead_created,public_form,simple detail");
  });

  it("quotes and escapes a details field containing a comma and embedded quotes", () => {
    const entry = makeEntry({ details: 'Exported, with a comma and "quotes"' });
    const csv = auditLogToCsv([entry], meta);
    expect(csv).toContain('"Exported, with a comma and ""quotes"""');
  });

  it("quotes a details field containing a newline", () => {
    const entry = makeEntry({ details: "line1\nline2" });
    const csv = auditLogToCsv([entry], meta);
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders a missing details field as an empty column, not the literal 'undefined'", () => {
    const entry = makeEntry({ details: undefined });
    const csv = auditLogToCsv([entry], meta);
    const dataLine = csv.split("\n").find((line) => line.startsWith(entry.timestamp));
    expect(dataLine).toBeDefined();
    expect(dataLine).not.toContain("undefined");
  });
});
