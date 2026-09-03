import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allocateLead } from "@/lib/marketplace-store";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reserveSupabaseLead } from "@/lib/supabase/data";

const schema = z.object({ leadId: z.string().min(1), buyerId: z.string().min(1), priceCents: z.number().int().min(0), exclusive: z.boolean().default(true) });

const safeAllocationErrors = [
  "Lead not found",
  "Lead is marked do not contact",
  "Partner-sharing consent is not recorded",
  "Approved buyer not found",
  "Lead does not match the buyer appetite",
  "Buyer does not accept shared leads",
  "Consent recipient limit reached",
  "Lead already has an incompatible active allocation",
];

function allocationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeAllocationErrors.find((candidate) => message.includes(candidate)) ?? "Allocation could not be completed";
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid allocation request" }, { status: 400 });
  try {
    if (getDataMode() === "demo") {
      return NextResponse.json({ ok: true, allocation: allocateLead({ ...parsed.data, actor: "demo_platform_admin" }) }, { status: 201 });
    }

    const identity = await getDashboardIdentity();
    if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!identity.accessAllowed || !isPlatformAdmin(identity)) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });

    const supabase = await createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "Marketplace is not configured" }, { status: 503 });
    const allocation = await reserveSupabaseLead(supabase, parsed.data);
    return NextResponse.json({ ok: true, allocation }, { status: 201 });
  }
  catch (error) {
    return NextResponse.json({ error: allocationErrorMessage(error) }, { status: 409 });
  }
}
