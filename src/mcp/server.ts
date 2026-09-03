import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import {
  appendRuntimeAuditLog,
  getRuntimeConsent,
  getRuntimeLead,
  listRuntimeAllocations,
  listRuntimeBuyers,
  listRuntimeLeads,
  reserveRuntimeLead,
  updateRuntimeLead,
} from "../lib/runtime-data.ts";
import type { Lead, LeadStatus } from "../lib/types.ts";
import { getAllocationEligibility, getEligibleBuyersForLead } from "../lib/marketplace-store.ts";
import { getDataMode } from "../lib/supabase/config.ts";

const server = new McpServer({ name: "insurelead-intelligence", version: "0.1.0" });

const leadStatusSchema = z.enum([
  "new", "contact_attempted", "contacted", "qualified", "consultation_booked",
  "quote_requested", "quote_issued", "negotiation", "won", "lost", "nurture",
  "do_not_contact", "archived",
]);

function result<T>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function safeLead(lead: Lead) {
  return {
    id: lead.id,
    businessName: lead.businessName,
    industry: lead.industry,
    city: lead.city,
    province: lead.province,
    website: lead.website,
    insuranceProducts: lead.insuranceProducts,
    currentInsuranceStatus: lead.currentInsuranceStatus,
    renewalMonth: lead.renewalMonth,
    financialYearEndMonth: lead.financialYearEndMonth,
    preferredContactChannel: lead.preferredContactChannel,
    status: lead.status,
    score: lead.score,
    scoreBand: lead.scoreBand,
    scoreExplanation: lead.scoreExplanation,
    campaignSource: lead.campaignSource,
    doNotContact: lead.doNotContact,
    assignedBroker: lead.assignedBroker,
    createdAt: lead.createdAt,
  };
}

function productionWritesEnabled() {
  return getDataMode() === "demo" || process.env.INSURELEAD_MCP_ALLOW_WRITES === "true";
}

server.registerTool(
  "list_leads",
  {
    title: "List InsureLead leads",
    description: "Search the business-insurance lead pipeline without exposing contact PII.",
    inputSchema: {
      status: leadStatusSchema.optional(),
      scoreBand: z.enum(["hot", "warm", "nurture", "low_priority"]).optional(),
      province: z.string().optional(),
      industry: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(25),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status, scoreBand, province, industry, limit }) => {
    const leads = (await listRuntimeLeads())
      .filter((lead) => !status || lead.status === status)
      .filter((lead) => !scoreBand || lead.scoreBand === scoreBand)
      .filter((lead) => !province || lead.province.toLowerCase() === province.toLowerCase())
      .filter((lead) => !industry || lead.industry.toLowerCase().includes(industry.toLowerCase()))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(safeLead);
    return result({ count: leads.length, leads });
  },
);

server.registerTool(
  "get_lead",
  {
    title: "Get lead details",
    description: "Get one lead. Contact details are returned only when contact consent exists.",
    inputSchema: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true },
  },
  async ({ leadId }) => {
    const lead = await getRuntimeLead(leadId);
    if (!lead) return result({ found: false, leadId });
    const consent = await getRuntimeConsent(leadId);
    const mayContact = Boolean(consent?.contactConsent) && !lead.doNotContact;
    return result({
      found: true,
      lead: safeLead(lead),
      contact: mayContact
        ? { fullName: lead.contactFullName, role: lead.contactRole,
            email: lead.contactEmail, mobile: lead.contactMobile }
        : null,
      consent: {
        mayContact,
        marketingConsent: Boolean(consent?.marketingConsent),
        wordingVersion: consent?.consentWordingVersion ?? null,
      },
    });
  },
);

server.registerTool(
  "recommend_next_leads",
  {
    title: "Recommend next leads",
    description: "Rank consented leads for human follow-up using the existing transparent score.",
    inputSchema: { limit: z.number().int().min(1).max(25).default(10) },
    annotations: { readOnlyHint: true },
  },
  async ({ limit }) => {
    const excluded: LeadStatus[] = ["won", "lost", "do_not_contact", "archived"];
    const candidates = (await listRuntimeLeads())
      .filter((lead) => !lead.doNotContact && !excluded.includes(lead.status))
      .sort((a, b) => b.score - a.score);
    const consented = await Promise.all(
      candidates.map(async (lead) => ({ lead, consent: await getRuntimeConsent(lead.id) })),
    );
    const leads = consented
      .filter(({ consent }) => Boolean(consent?.contactConsent))
      .slice(0, limit)
      .map(({ lead }) => ({ ...safeLead(lead), reason: lead.scoreExplanation }));
    return result({ count: leads.length, requiresHumanDecision: true, leads });
  },
);

server.registerTool(
  "update_lead_status",
  {
    title: "Update lead status",
    description: "Move a lead through the broker pipeline and write an audit entry.",
    inputSchema: {
      leadId: z.string().min(1),
      status: leadStatusSchema,
      reason: z.string().min(3).max(500),
      actor: z.string().min(2).max(100).default("mcp_user"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async ({ leadId, status, reason, actor }) => {
    if (!productionWritesEnabled()) {
      return result({ updated: false, error: "Production MCP writes are disabled", leadId });
    }
    const lead = await updateRuntimeLead(
      leadId,
      status === "do_not_contact" ? { status, doNotContact: true } : { status },
    );
    if (!lead) return result({ updated: false, error: "Lead not found", leadId });
    await appendRuntimeAuditLog({ entity: "status", entityId: leadId, action: `status_changed_to_${status}`,
      actor, details: reason });
    return result({ updated: true, lead: safeLead(lead) });
  },
);

server.registerTool(
  "draft_follow_up",
  {
    title: "Draft lead follow-up",
    description: "Draft a message for human approval. This tool never sends messages.",
    inputSchema: {
      leadId: z.string().min(1),
      channel: z.enum(["email", "phone", "whatsapp"]).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ leadId, channel }) => {
    const lead = await getRuntimeLead(leadId);
    if (!lead) return result({ drafted: false, error: "Lead not found", leadId });
    const consent = await getRuntimeConsent(leadId);
    if (lead.doNotContact || !consent?.contactConsent) {
      return result({ drafted: false, error: "Contact is not permitted for this lead", leadId });
    }
    const selectedChannel = channel ?? lead.preferredContactChannel;
    const message =
      `Hi ${lead.contactFullName}, I’m following up on ${lead.businessName}’s request for a ` +
      `business-insurance consultation. Based on the information submitted, we can review ` +
      `${lead.insuranceProducts.length} area(s) of cover. Would you like to arrange a short discussion?`;
    return result({ drafted: true, leadId, channel: selectedChannel, message,
      requiresHumanApproval: true, sent: false });
  },
);

server.registerTool(
  "match_lead_to_buyers",
  {
    title: "Match lead to approved buyers",
    description: "Find active buyers whose approved appetite matches a consented lead.",
    inputSchema: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true },
  },
  async ({ leadId }) => {
    const lead = await getRuntimeLead(leadId);
    if (!lead) return result({ matched: false, error: "Lead not found", leadId });
    const [consent, allocations, allBuyers] = await Promise.all([
      getRuntimeConsent(leadId),
      listRuntimeAllocations(),
      listRuntimeBuyers(),
    ]);
    const check = getAllocationEligibility(lead, consent, allocations);
    if (!check.allowed) return result({ matched: false, error: check.reason, leadId });
    const buyers = getEligibleBuyersForLead(lead, allBuyers).map((buyer) => ({
      id: buyer.id,
      organisationName: buyer.organisationName,
      buyerType: buyer.buyerType,
      status: buyer.status,
      provinces: buyer.provinces,
      industries: buyer.industries,
      minimumScore: buyer.minimumScore,
    }));
    return result({ matched: buyers.length > 0, lead: safeLead(lead), buyers });
  },
);

server.registerTool(
  "reserve_lead",
  {
    title: "Reserve a lead for a buyer",
    description: "Reserve an eligible consented lead for an approved buyer and create an audit record.",
    inputSchema: { leadId: z.string().min(1), buyerId: z.string().min(1), priceCents: z.number().int().min(0), exclusive: z.boolean().default(true), actor: z.string().min(2).default("mcp_platform_admin") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ leadId, buyerId, priceCents, exclusive, actor }) => {
    if (!productionWritesEnabled()) {
      return result({ reserved: false, error: "Production MCP writes are disabled" });
    }
    try { return result({ reserved: true, allocation: await reserveRuntimeLead({ leadId, buyerId, priceCents, exclusive, actor }) }); }
    catch (error) { return result({ reserved: false, error: error instanceof Error ? error.message : "Reservation failed" }); }
  },
);

server.registerTool(
  "pipeline_summary",
  {
    title: "Pipeline summary",
    description: "Aggregate the lead pipeline by status, score band, industry, and province.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const leads = await listRuntimeLeads();
    const countBy = (key: "status" | "scoreBand" | "industry" | "province") =>
      leads.reduce<Record<string, number>>((acc, lead) => {
        const value = lead[key];
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {});
    return result({ total: leads.length, byStatus: countBy("status"),
      byScoreBand: countBy("scoreBand"), byIndustry: countBy("industry"),
      byProvince: countBy("province") });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("InsureLead Intelligence MCP server running on stdio");
}

main().catch((error) => {
  console.error("InsureLead MCP server failed", error);
  process.exit(1);
});
