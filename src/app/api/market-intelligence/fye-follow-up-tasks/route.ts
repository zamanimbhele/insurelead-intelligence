import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUpdateLeadStatus, getDashboardIdentity } from "@/lib/auth";
import { createDashboardFyeFollowUpTasks } from "@/lib/dashboard-data";
import { MONTH_NAMES } from "@/lib/aggregation-utils";

const schema = z.object({
  month: z.enum(MONTH_NAMES as [string, ...string[]]),
  taskTitle: z.string().trim().min(1).max(200),
});

// Bulk-creates one broker follow-up task per eligible lead whose
// financial-year-end falls in `month` (brief section 8: "Create broker
// follow-up task lists"). Gated the same way a single follow-up task
// already is (canUpdateLeadStatus - platform admin or broker operator) -
// this is just that same action run many times, never a looser one, and
// createDashboardFyeFollowUpTasks re-runs the exact same per-lead creation
// path (including, in Supabase mode, create_lead_task's own org-allocation
// re-check) for every lead in the batch.
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A month and task title are required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canUpdateLeadStatus(identity)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const actor = identity.displayName ?? identity.organisationName;

  try {
    const result = await createDashboardFyeFollowUpTasks(parsed.data.month, parsed.data.taskTitle, actor);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "The follow-up tasks could not be created" }, { status: 500 });
  }
}
