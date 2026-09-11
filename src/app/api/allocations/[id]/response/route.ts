import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canRespondToAllocations, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { respondToSupabaseAllocation } from "@/lib/supabase/data";

const schema = z.object({ decision: z.enum(["accepted", "released"]) });

const safeErrors = [
  "Allocation not found",
  "Allocation belongs to another organisation",
  "Only reserved allocations may be accepted or released",
  "Only an active broker operator may respond to an allocation",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate))
    ?? "The allocation response could not be recorded";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (getDataMode() === "demo") {
    return NextResponse.json({ error: "Broker allocation responses require Supabase mode" }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid allocation response" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canRespondToAllocations(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const { id } = await params;
    const allocation = await respondToSupabaseAllocation(client, {
      allocationId: id,
      decision: parsed.data.decision,
    });
    return NextResponse.json({ ok: true, allocation });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
