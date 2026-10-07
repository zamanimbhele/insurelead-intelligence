import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { getDashboardAuditLog } from "@/lib/dashboard-data";
import { auditLogToCsv } from "@/lib/audit-log";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appendSupabaseAuditLog } from "@/lib/supabase/data";
import { appendAuditLog } from "@/lib/demo-store";

const ENTITY_VALUES = [
  "lead", "consent", "assignment", "status", "campaign", "suppression", "settings",
  "note", "task", "opt_out", "data_subject_request", "data_source", "fye_campaign_plan", "export",
] as const;

const schema = z.object({
  entity: z.enum(ENTITY_VALUES).optional(),
  action: z.string().trim().max(200).optional(),
  actor: z.string().trim().max(200).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
});

// Re-fetches and re-filters server-side with exactly the filters the client
// sent, rather than trusting a client-supplied row list - the brief
// (section 12, "Restricted data exports") requires every export to record
// exporter, date, filters and record count, and that is only trustworthy
// if the server derives the record count itself. The export is then logged
// to audit_logs as its own "export" entry, which is what feeds the
// Compliance dashboard's "Export activity" widget.
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may export the audit log" }, { status: 403 });
  }

  const actor = identity.displayName ?? identity.organisationName;
  const filters = parsed.data;

  try {
    const entries = await getDashboardAuditLog(filters);
    const exportedAt = new Date().toISOString();

    let auditLogReference: string;
    if (getDataMode() === "demo") {
      const entry = appendAuditLog({
        entity: "export",
        entityId: "audit_log",
        action: "audit_log_exported",
        actor,
        details: `recordCount=${entries.length}`,
      });
      auditLogReference = entry.id;
    } else {
      const client = await createSupabaseServerClient();
      if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });
      const id = await appendSupabaseAuditLog(client, {
        entity: "export",
        entityId: "audit_log",
        action: "audit_log_exported",
        actor,
        details: `recordCount=${entries.length}`,
      });
      auditLogReference = id ?? "audit_logs (id not returned)";
    }

    const csv = auditLogToCsv(entries, { exportedBy: actor, exportedAt, filters, auditLogReference });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-export-${Date.now()}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "The audit log could not be exported" }, { status: 500 });
  }
}
