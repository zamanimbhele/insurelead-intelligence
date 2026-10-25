import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCampaigns, getDashboardIdentity } from "@/lib/auth";
import { createDashboardCampaignDraft } from "@/lib/dashboard-data";
import { getProductCatalogue } from "@/lib/product-catalogue";
import { PRODUCT_ID_PATTERN, unavailableProductIds } from "@/lib/products";

// Dashboard counterpart to the Campaign Orchestration MCP server's
// create_campaign_draft tool (src/mcp/campaign-tools.ts) - same input
// shape, same pre-checks (via createDashboardCampaignDraft() in
// dashboard-data.ts), same "draft" starting status. This never
// generates content, approves, or sends anything.
const productSchema = z.string().regex(PRODUCT_ID_PATTERN);

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  objective: z.enum(["awareness", "renewal_reminder", "cross_sell", "quote_follow_up", "seasonal"]),
  insuranceProducts: z.array(productSchema).min(1),
  sendingIdentityId: z.string().trim().min(1),
  applicantTypes: z.array(z.enum(["individual", "business"])).optional(),
  provinces: z.array(z.string().trim().min(1)).optional(),
  cities: z.array(z.string().trim().min(1)).optional(),
  industries: z.array(z.string().trim().min(1)).optional(),
  minimumScore: z.number().int().min(0).max(100).optional(),
});

const safeErrors = [
  "Only a broker administrator, campaign manager, or platform administrator may create a campaign",
  "Your account has no organisation to create a campaign for",
  "Campaign broker must be active and approved",
  "Campaign permission is disabled for this broker",
  "Campaign includes products outside the broker's approved appetite",
  "Broker is not authorised for one or more of this campaign's products",
  "Sending identity belongs to another tenant or does not exist",
];

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return safeErrors.find((candidate) => message.includes(candidate)) ?? "The campaign could not be created";
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid campaign name, objective, products, and sending identity are required" }, { status: 400 });
  }
  if (unavailableProductIds(parsed.data.insuranceProducts, await getProductCatalogue()).length > 0) {
    return NextResponse.json({ error: "One or more products are not offered" }, { status: 400 });
  }

  const identity = await getDashboardIdentity();
  if (!identity.authenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!identity.accessAllowed || !canManageCampaigns(identity)) {
    return NextResponse.json(
      { error: "Only a broker administrator, campaign manager, or platform administrator may create a campaign" },
      { status: 403 },
    );
  }

  try {
    const campaign = await createDashboardCampaignDraft(identity, {
      name: parsed.data.name,
      objective: parsed.data.objective,
      insuranceProducts: parsed.data.insuranceProducts,
      sendingIdentityId: parsed.data.sendingIdentityId,
      audienceRules: {
        applicantTypes: parsed.data.applicantTypes,
        provinces: parsed.data.provinces,
        cities: parsed.data.cities,
        industries: parsed.data.industries,
        minimumScore: parsed.data.minimumScore,
      },
    });
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 409 });
  }
}
