import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allocateLead } from "@/lib/marketplace-store";
const schema = z.object({ leadId: z.string().min(1), buyerId: z.string().min(1), priceCents: z.number().int().min(0), exclusive: z.boolean().default(true) });
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid allocation request" }, { status: 400 });
  try { return NextResponse.json({ ok: true, allocation: allocateLead({ ...parsed.data, actor: "demo_platform_admin" }) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Allocation failed" }, { status: 409 }); }
}
