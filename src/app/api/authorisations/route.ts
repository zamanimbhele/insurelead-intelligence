import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardIdentity } from "@/lib/auth";
import { safeAuthorisationError } from "@/lib/authorisations";
import { submitAuthorisation } from "@/lib/authorisation-service";

// A broker or advisor records what they are authorised to sell, with the
// evidence. It stays "awaiting review" until a platform admin verifies it.
const schema = z.object({
  categoryId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  evidenceType: z.enum(["fsp_licence", "representative_appointment", "cms_accreditation", "ncr_registration", "bank_mandate"]),
  referenceNumber: z.string().trim().min(2, "A reference number is required").max(60),
  providerName: z.string().trim().max(160).optional(),
  evidenceNote: z.string().trim().max(1000).optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details and try again" }, { status: 400 });
  }
  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed) return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });

  try {
    const authorisation = await submitAuthorisation(identity, { ...parsed.data, expiresOn: parsed.data.expiresOn || undefined });
    return NextResponse.json({ ok: true, authorisation });
  } catch (error) {
    return NextResponse.json({ error: safeAuthorisationError(error, "The authorisation could not be recorded") }, { status: 409 });
  }
}
