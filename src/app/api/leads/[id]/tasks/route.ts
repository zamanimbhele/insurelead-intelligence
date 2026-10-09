import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseLeadTask } from "@/lib/supabase/data";
import { createLeadTask } from "@/lib/demo-store";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().datetime().optional(),
  assigneeLabel: z.string().trim().max(200).optional(),
});

const safeErrors = [
  "Task title must not be empty",
  "Only an active platform member may create a task",
  "Only a platform administrator or broker operator may create a task",
  "Lead is not allocated to your organisation",
  "Lead is marked do not contact",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The task could not be created";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A task title is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canUpdateLeadStatus(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const actor = identity.displayName ?? identity.organisationName;

  if (getDataMode() === "demo") {
    try {
      const task = createLeadTask(id, parsed.data, actor);
      if (!task) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      return NextResponse.json({ ok: true, task });
    } catch (error) {
      return NextResponse.json({ error: safeError(error) }, { status: 409 });
    }
  }

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });

  try {
    const taskId = await createSupabaseLeadTask(client, { leadId: id, ...parsed.data });
    return NextResponse.json({ ok: true, id: taskId });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
