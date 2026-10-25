import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setSupabaseWorkspaceType } from "@/lib/supabase/data";
import { setBuyerWorkspaceType } from "@/lib/marketplace-store";
import { WORKSPACE_TYPES } from "@/lib/workspace";

// Changes how an organisation is presented: individual, practice or
// brokerage. A platform admin may change any organisation; a broker
// admin only their own (set_workspace_type() re-checks this in Supabase).
const schema = z.object({ workspaceType: z.enum(WORKSPACE_TYPES) });

const safeErrors = [
  "Workspace type must be individual, practice or brokerage",
  "Only a platform administrator or the organisation's broker admin may change its workspace type",
  "Broker organisation not found",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The workspace type could not be changed";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose individual, practice or brokerage" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const ownOrganisation = identity.role === "broker_admin" && identity.organisationId === id;
  if (!identity.accessAllowed || !(isPlatformAdmin(identity) || ownOrganisation)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  try {
    if (getDataMode() === "demo") {
      const buyer = setBuyerWorkspaceType(id, parsed.data.workspaceType, identity.displayName ?? identity.organisationName);
      return NextResponse.json({ ok: true, workspaceType: buyer.workspaceType });
    }
    const client = await createSupabaseServerClient();
    if (!client) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });
    const result = await setSupabaseWorkspaceType(client, { organisationId: id, workspaceType: parsed.data.workspaceType });
    return NextResponse.json({ ok: true, workspaceType: result.workspaceType });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
