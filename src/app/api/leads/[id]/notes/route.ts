import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addSupabaseLeadNote } from "@/lib/supabase/data";
import { addLeadNote } from "@/lib/demo-store";

const schema = z.object({ body: z.string().trim().min(1).max(2000) });

const safeErrors = [
  "Note body must not be empty",
  "Only an active platform member may add a note",
  "Only a platform administrator or broker operator may add a note",
  "Lead is not allocated to your organisation",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The note could not be added";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A note body is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canUpdateLeadStatus(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  if (getDataMode() === "demo") {
    try {
      const note = addLeadNote(id, parsed.data.body, actor);
      if (!note) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      return NextResponse.json({ ok: true, note });
    } catch (error) {
      return NextResponse.json({ error: safeError(error) }, { status: 409 });
    }
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const noteId = await addSupabaseLeadNote(client, { leadId: id, body: parsed.data.body });
    return NextResponse.json({ ok: true, id: noteId });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
