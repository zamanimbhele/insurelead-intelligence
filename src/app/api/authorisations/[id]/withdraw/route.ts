import { NextRequest, NextResponse } from "next/server";
import { getDashboardIdentity } from "@/lib/auth";
import { withdrawAuthorisation } from "@/lib/authorisation-service";
import { safeAuthorisationError } from "@/lib/authorisations";

// The holder withdraws their own authorisation (for example when an
// appointment ends).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  try {
    const { id } = await params;
    const authorisation = await withdrawAuthorisation(identity, id);
    return NextResponse.json({ ok: true, authorisation });
  } catch (error) {
    return NextResponse.json({ error: safeAuthorisationError(error, "The authorisation could not be withdrawn") }, { status: 409 });
  }
}
