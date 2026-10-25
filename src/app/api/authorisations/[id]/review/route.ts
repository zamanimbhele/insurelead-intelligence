import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity, isPlatformAdmin } from "@/lib/auth";
import { reviewAuthorisation } from "@/lib/authorisation-service";
import { safeAuthorisationError } from "@/lib/authorisations";

// Platform admins verify, reject or revoke an authorisation. Rejecting
// and revoking need a reason the holder will see.
const schema = z.object({
  decision: z.enum(["verify", "reject", "revoke"]),
  note: z.string().trim().max(1000).optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose verify, reject or revoke" }, { status: 400 });

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !isPlatformAdmin(identity)) {
    return NextResponse.json({ error: "Only a platform administrator may review authorisations" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const authorisation = await reviewAuthorisation(identity, id, { ...parsed.data, expiresOn: parsed.data.expiresOn || undefined });
    return NextResponse.json({ ok: true, authorisation });
  } catch (error) {
    return NextResponse.json({ error: safeAuthorisationError(error, "The authorisation could not be reviewed") }, { status: 409 });
  }
}
