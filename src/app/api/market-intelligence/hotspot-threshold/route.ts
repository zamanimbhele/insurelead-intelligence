import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompliance, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appendSupabaseAuditLog } from "@/lib/supabase/data";
import { appendAuditLog } from "@/lib/demo-store";
import { updateApplicationSettings } from "@/lib/dashboard-data";
import { MAX_HOTSPOT_THRESHOLD, MIN_HOTSPOT_THRESHOLD } from "@/lib/constants";

const schema = z.object({
  hotspotMinLeadThreshold: z.number().int().min(MIN_HOTSPOT_THRESHOLD).max(MAX_HOTSPOT_THRESHOLD),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Minimum lead threshold must be between ${MIN_HOTSPOT_THRESHOLD} and ${MAX_HOTSPOT_THRESHOLD}` },
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
      const settings = await updateApplicationSettings({ hotspotMinLeadThreshold: parsed.data.hotspotMinLeadThreshold });
      appendAuditLog({
        entity: "settings",
        entityId: "application_settings",
        action: "hotspot_threshold_changed",
        actor,
        details: `hotspot_min_lead_threshold -> ${parsed.data.hotspotMinLeadThreshold}`,
      });
      return NextResponse.json({ ok: true, settings });
    }

    const client = await createSupabaseServerClient();
    if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

    const settings = await updateApplicationSettings(
      { hotspotMinLeadThreshold: parsed.data.hotspotMinLeadThreshold },
      identity.userId,
    );
    await appendSupabaseAuditLog(client, {
      entity: "settings",
      entityId: "application_settings",
      action: "hotspot_threshold_changed",
      actor,
      details: `hotspot_min_lead_threshold -> ${parsed.data.hotspotMinLeadThreshold}`,
    });
    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json({ error: "The hotspot threshold could not be updated" }, { status: 500 });
  }
}
