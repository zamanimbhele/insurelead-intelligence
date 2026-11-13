import { NextRequest, NextResponse } from "next/server";
import { getDashboardIdentity } from "@/lib/auth";
import { getProductCatalogue } from "@/lib/product-catalogue";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { PublicSubmissionUnavailableError } from "@/lib/security/errors";
import { addStaffLead, canAddLeads, getStaffLeadProductOptions } from "@/lib/staff-leads";
import { createStaffLeadSchema } from "@/lib/validation/staffLeadSchema";

export const dynamic = "force-dynamic";

// Database messages that are safe and useful to show as they are.
const safeErrors = [
  "Only an active workspace member may add a lead",
  "Only a broker administrator or agent may add a lead",
  "Your organisation is not approved to add leads",
  "Your organisation is not authorised for one or more of these products",
  "An insurance product does not match the applicant type",
  "Daily limit for adding leads has been reached",
  "Say how this person agreed to be contacted",
  "Confirm that this person agreed to be contacted",
  "Describe how this person agreed to be contacted",
  "An email address or a mobile number is required",
];

const noStore = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...noStore, ...headers } });

// A signed-in broker operator adds one lead to their own practice. The
// organisation is never read from the request: add_staff_lead() takes it
// from the caller's profile and re-checks everything below.
export async function POST(request: NextRequest) {
  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return reply({ error: "Authentication required" }, 401);
  if (!identity.accessAllowed || !canAddLeads(identity)) return reply({ error: "Insufficient permissions" }, 403);

  // Before anything else happens: one person cannot add leads faster than a
  // person could type them. The database also caps a practice at 200 a day.
  try {
    const limit = await checkRateLimit(
      `staff-lead:${identity.userId ?? identity.demoAccountKey ?? identity.email ?? "unknown"}`,
      { windowSeconds: 3600, maximumRequests: 60 },
    );
    if (!limit.allowed) {
      return reply({ error: "You are adding leads too quickly. Try again later." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    }
  } catch (error) {
    if (error instanceof PublicSubmissionUnavailableError) return reply({ error: "Adding leads is temporarily unavailable." }, 503);
    throw error;
  }

  const catalogue = await getProductCatalogue();
  const { authorised } = await getStaffLeadProductOptions(identity, catalogue);
  const parsed = createStaffLeadSchema(catalogue, authorised).safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Field messages only; the submitted values are never echoed or logged.
    return reply({ error: "Check the highlighted fields", issues: parsed.error.flatten().fieldErrors }, 400);
  }

  try {
    const result = await addStaffLead(identity, parsed.data);
    if (result.status === "duplicate") {
      return reply({ error: "A lead with this email or mobile number is already in your workspace", duplicateLeadId: result.leadId }, 409);
    }
    return reply({ ok: true, leadId: result.leadId }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = safeErrors.find((candidate) => message.includes(candidate));
    return reply({ error: safe ?? "The lead could not be added" }, safe ? 409 : 500);
  }
}
