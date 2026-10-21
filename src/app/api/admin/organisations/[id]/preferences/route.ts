import { NextRequest, NextResponse } from "next/server";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSupabaseBuyerPreferences } from "@/lib/supabase/data";
import { updateBuyerPreferences } from "@/lib/marketplace-store";
import { brokerPreferencesSchema } from "@/lib/validation/brokerPreferences";

// Platform-admin-only: sets a broker/insurer tenant's approved product
// appetite, territory, score floor, capacity and campaign/shared-lead
// permissions. Appetite is a compliance control, so a broker can never
// set its own; update_buyer_preferences() re-checks the caller's role in
// Supabase mode regardless of this route's gate.
const safeErrors = [
  "Only a platform administrator may change a broker's appetite",
  "Broker organisation not found",
  "Insurance product is not recognised",
  "Province is not recognised",
  "Minimum score must be between 0 and 100",
  "Daily lead capacity must be between 1 and 1000",
  "Campaigns require at least one approved insurance product",
  "Daily campaign send limit must be between 1 and 50000",
  "Monthly campaign send limit must be between 1 and 1000000",
  "Daily campaign send limit cannot exceed the monthly limit",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The broker's preferences could not be updated";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = brokerPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid broker preferences" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !isPlatformAdmin(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const actorLabel = identity.displayName ?? identity.email ?? identity.organisationName;

  try {
    if (getDataMode() === "demo") {
      const buyer = updateBuyerPreferences(id, parsed.data, actorLabel);
      return NextResponse.json({ ok: true, organisationId: buyer.id, insuranceProducts: buyer.insuranceProducts });
    }

    const client = await createSupabaseServerClient();
    if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });
    const result = await updateSupabaseBuyerPreferences(client, { organisationId: id, ...parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
