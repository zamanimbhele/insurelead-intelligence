import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSupabaseBrandSettings } from "@/lib/supabase/data";
import { setBuyerBrand } from "@/lib/marketplace-store";

// Company or personal brand, with the representative disclosure details.
// The organisation's broker admin or a platform admin may change it;
// update_brand_settings() re-checks in Supabase mode.
const schema = z.object({
  brandMode: z.enum(["company", "personal"]),
  displayName: z.string().trim().max(120).optional(),
  capacity: z.enum(["representative", "key_individual"]).optional().or(z.literal("")),
  fspName: z.string().trim().max(160).optional(),
  fspNumber: z.string().trim().max(40).optional(),
});

const safeErrors = [
  "Only a platform administrator or the organisation's broker admin may change its branding",
  "Broker organisation not found",
  "Brand mode must be company or personal",
  "Capacity must be representative or key individual",
  "A personal brand needs your name, capacity, FSP name and FSP number",
  "One of the branding details is too long",
];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the branding details and try again" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const own = identity.role === "broker_admin" && identity.organisationId === id;
  if (!identity.accessAllowed || !(own || isPlatformAdmin(identity))) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  const capacity = parsed.data.capacity || undefined;

  try {
    if (getDataMode() === "demo") {
      const buyer = setBuyerBrand(id, { mode: parsed.data.brandMode, displayName: parsed.data.displayName, capacity, fspName: parsed.data.fspName, fspNumber: parsed.data.fspNumber },
        identity.displayName ?? identity.organisationName);
      return NextResponse.json({ ok: true, brand: buyer.brand });
    }
    const client = await createSupabaseServerClient();
    if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });
    const result = await updateSupabaseBrandSettings(client, { organisationId: id, ...parsed.data, capacity });
    return NextResponse.json({ ok: true, brandMode: result.brandMode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: safeErrors.find((candidate) => message.includes(candidate)) ?? "The branding could not be saved" }, { status: 409 });
  }
}
