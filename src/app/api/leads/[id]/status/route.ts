import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSupabaseLeadStatus } from "@/lib/supabase/data";
import { updateLeadStatus as updateDemoLeadStatus, appendAuditLog } from "@/lib/demo-store";
import { LEAD_STATUS_ORDER } from "@/lib/constants";
import type { LeadStatus } from "@/lib/types";

const schema = z.object({
  status: z.enum(LEAD_STATUS_ORDER as [LeadStatus, ...LeadStatus[]]),
  lossReason: z.string().trim().min(1).max(500).optional(),
});

const safeErrors = [
  "Lead not found",
  "Status must be a recognised lead pipeline stage",
  "A loss reason is required when marking a lead as lost",
  "Only an active platform member may update lead status",
  "Only a platform administrator or broker operator may update lead status",
  "Lead is not allocated to your organisation",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate))
    ?? "The lead status could not be updated";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead status" }, { status: 400 });
  if (parsed.data.status === "lost" && !parsed.data.lossReason) {
    return NextResponse.json({ error: "A loss reason is required when marking a lead as lost" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canUpdateLeadStatus(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  if (getDataMode() === "demo") {
    try {
      const previous = updateDemoLeadStatus(id, parsed.data.status, parsed.data.lossReason, actor);
      if (!previous) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      appendAuditLog({
        entity: "status",
        entityId: id,
        action: "lead_status_changed",
        actor,
        details: `status -> ${parsed.data.status}`,
      });
      return NextResponse.json({
        ok: true,
        status: previous.status,
        doNotContact: previous.doNotContact,
        lossReason: previous.lossReason,
      });
    } catch (error) {
      return NextResponse.json({ error: safeError(error) }, { status: 409 });
    }
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const result = await updateSupabaseLeadStatus(client, {
      leadId: id,
      status: parsed.data.status,
      lossReason: parsed.data.lossReason,
    });
    return NextResponse.json({
      ok: true,
      status: result.status,
      doNotContact: result.doNotContact,
      lossReason: result.lossReason,
    });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
