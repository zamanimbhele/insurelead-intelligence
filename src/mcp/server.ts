import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import {
  appendAuditLog,
  getConsentByLeadId,
  getLeadById,
  getLeads,
  updateLead,
} from "../lib/demo-store.ts";
import type { Lead, LeadStatus } from "../lib/types.ts";

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
    const leads = getLeads()
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
    const lead = getLeadById(leadId);
    if (!lead) return result({ found: false, leadId });
    const consent = getConsentByLeadId(leadId);
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
    const leads = getLeads()
      .filter((lead) => !lead.doNotContact && !excluded.includes(lead.status))
      .filter((lead) => Boolean(getConsentByLeadId(lead.id)?.contactConsent))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((lead) => ({ ...safeLead(lead), reason: lead.scoreExplanation }));
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
    const lead = updateLead(
      leadId,
      status === "do_not_contact" ? { status, doNotContact: true } : { status },
    );
    if (!lead) return result({ updated: false, error: "Lead not found", leadId });
    appendAuditLog({ entity: "status", entityId: leadId, action: `status_changed_to_${status}`,
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
    const lead = getLeadById(leadId);
    if (!lead) return result({ drafted: false, error: "Lead not found", leadId });
    const consent = getConsentByLeadId(leadId);
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
  "pipeline_summary",
  {
    title: "Pipeline summary",
    description: "Aggregate the lead pipeline by status, score band, industry, and province.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const leads = getLeads();
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
