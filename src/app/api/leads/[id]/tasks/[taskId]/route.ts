import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeSupabaseLeadTask } from "@/lib/supabase/data";
import { completeLeadTask } from "@/lib/demo-store";

const schema = z.object({ status: z.enum(["completed", "cancelled"]) });

const safeErrors = [
  "Task not found",
  "Task status must be completed or cancelled",
  "Only an active platform member may update a task",
  "Only a platform administrator or broker operator may update a task",
  "Lead is not allocated to your organisation",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The task could not be updated";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid task status is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canUpdateLeadStatus(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { taskId } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  if (getDataMode() === "demo") {
    try {
      const task = completeLeadTask(taskId, parsed.data.status, actor);
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
      return NextResponse.json({ ok: true, task });
    } catch (error) {
      return NextResponse.json({ error: safeError(error) }, { status: 409 });
    }
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    await completeSupabaseLeadTask(client, { taskId, status: parsed.data.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
