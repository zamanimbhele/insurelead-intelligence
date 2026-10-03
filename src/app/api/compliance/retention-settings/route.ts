import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appendSupabaseAuditLog } from "@/lib/supabase/data";
import { appendAuditLog } from "@/lib/demo-store";
import { updateApplicationSettings } from "@/lib/dashboard-data";
import { MAX_LEAD_RETENTION_DAYS, MIN_LEAD_RETENTION_DAYS } from "@/lib/constants";

const schema = z.object({
  leadRetentionDays: z.number().int().min(MIN_LEAD_RETENTION_DAYS).max(MAX_LEAD_RETENTION_DAYS),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Retention period must be between ${MIN_LEAD_RETENTION_DAYS} and ${MAX_LEAD_RETENTION_DAYS} days` },
      { status: 400 },
    );
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCompliance(identity)) {
    return NextResponse.json({ error: "Only a platform or compliance administrator may change this setting" }, { status: 403 });
  }

  const actor = identity.displayName ?? identity.organisationName;

  try {
    if (getDataMode() === "demo") {
      const settings = await updateApplicationSettings({ leadRetentionDays: parsed.data.leadRetentionDays });
      appendAuditLog({
        entity: "settings",
        entityId: "application_settings",
        action: "retention_threshold_changed",
        actor,
        details: `lead_retention_days -> ${parsed.data.leadRetentionDays}`,
      });
      return NextResponse.json({ ok: true, settings });
    }

    const client = await createSupabaseServerClient();
    if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

    const settings = await updateApplicationSettings(
      { leadRetentionDays: parsed.data.leadRetentionDays },
      identity.userId,
    );
    await appendSupabaseAuditLog(client, {
      entity: "settings",
      entityId: "application_settings",
      action: "retention_threshold_changed",
      actor,
      details: `lead_retention_days -> ${parsed.data.leadRetentionDays}`,
    });
    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json({ error: "The retention setting could not be updated" }, { status: 500 });
  }
}
