import { NextResponse } from "next/server";
import { canCreateSendingIdentity, getDashboardIdentity } from "@/lib/auth";
import { campaignSenderName } from "@/lib/brand";
import { getDashboardBrokerWorkspace } from "@/lib/dashboard-data";
import { createPlatformSendingIdentity } from "@/lib/marketplace-store";
import { platformSendingDomain } from "@/lib/sender-reputation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDataMode } from "@/lib/supabase/config";

// "<Name> via InsureLead" (phase 5): for advisors without their own email
// domain. Created only here, on the server, with the platform's own
// domain and the caller's confirmed email as reply-to; nothing the client
// sends decides the domain or the addresses.
const safeErrors = [
  "Only a broker manager or campaign manager may add a sending identity",
  "Your organisation must be approved before it can send",
  "The platform sending domain is not configured",
  "Your account has no confirmed email address for replies",
  "Your organisation already has an InsureLead sending identity",
];

export async function POST() {
  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canCreateSendingIdentity(identity) || !identity.organisationId) {
    return NextResponse.json({ error: "Only a broker manager or campaign manager may add a sending identity" }, { status: 403 });
  }
  const demo = getDataMode() === "demo";
  const domain = platformSendingDomain(process.env.INSURELEAD_PLATFORM_SENDING_DOMAIN, demo);
  if (!domain) return NextResponse.json({ error: "InsureLead sending is not set up yet. Ask the InsureLead team." }, { status: 409 });

  const workspace = await getDashboardBrokerWorkspace(identity);
  const buyer = workspace?.buyer;
  if (!buyer) return NextResponse.json({ error: "Broker organisation not found" }, { status: 409 });
  const fromName = campaignSenderName(buyer.organisationName, buyer.brand);

  try {
    if (demo) {
      const sendingIdentity = createPlatformSendingIdentity(
        { organisationId: buyer.id, displayName: fromName, replyToEmail: identity.email ?? buyer.contactEmail, domain },
        identity.displayName ?? identity.organisationName,
      );
      return NextResponse.json({ ok: true, sendingIdentity });
    }
    const admin = createSupabaseAdminClient();
    if (!admin || !identity.userId) return NextResponse.json({ error: "Broker workspace is not configured" }, { status: 503 });
    const { data, error } = await admin.rpc("create_platform_sending_identity", {
      p_profile_id: identity.userId,
      p_domain: domain,
      p_from_name: fromName,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, sendingIdentity: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: safeErrors.find((candidate) => message.includes(candidate)) ?? "InsureLead sending could not be set up" }, { status: 409 });
  }
}
