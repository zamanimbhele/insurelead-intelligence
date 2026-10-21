import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity } from "@/lib/auth";
import { setDemoTaskDigestPreference } from "@/lib/demo-store";
import { getDataMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setOwnTaskDigestPreference } from "@/lib/supabase/task-digest-data";
import { DIGEST_ROLES } from "@/lib/task-digest-runtime";

// A broker user switches their own daily task digest on or off. Only ever
// the caller's own profile: set_own_task_digest_preference() updates
// auth.uid()'s row and nothing else.
const schema = z.object({ enabled: z.boolean() });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A digest preference is required" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !(DIGEST_ROLES as readonly string[]).includes(identity.role)) {
    return NextResponse.json({ error: "The task digest is for broker admins and broker agents" }, { status: 403 });
  }

  try {
    if (getDataMode() === "demo") {
      setDemoTaskDigestPreference(identity.email ?? "", parsed.data.enabled);
    } else {
      const client = await createSupabaseServerClient();
      if (!client) return NextResponse.json({ error: "Workspace is not configured" }, { status: 503 });
      await setOwnTaskDigestPreference(client, parsed.data.enabled);
    }
    return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
  } catch {
    return NextResponse.json({ error: "Your digest preference could not be saved" }, { status: 409 });
  }
}
