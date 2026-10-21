import { describe, expect, it } from "vitest";
import {
  NOT_ALLOCATED_REASON,
  anonymousLeadReference,
  buildAudienceBreakdown,
  compareContentVersions,
  defaultComparison,
  diffLines,
} from "./campaign-transparency";
import type { CampaignContentVersion, CampaignRecipient, Lead } from "./types";

describe("diffLines", () => {
  it("marks unchanged, removed and added lines in order", () => {
    expect(diffLines("Hi {{first_name}}\nYour motor cover renews soon.\nRegards", "Hi {{first_name}}\nYour cover renews next month.\nRegards"))
      .toEqual([
        { kind: "same", text: "Hi {{first_name}}" },
        { kind: "removed", text: "Your motor cover renews soon." },
        { kind: "added", text: "Your cover renews next month." },
        { kind: "same", text: "Regards" },
      ]);
  });

  it("handles pure additions and identical text", () => {
    expect(diffLines("a", "a\nb")).toEqual([{ kind: "same", text: "a" }, { kind: "added", text: "b" }]);
    expect(diffLines("a\nb", "a\nb").every((line) => line.kind === "same")).toBe(true);
  });
});

function version(n: number, overrides: Partial<CampaignContentVersion> = {}): CampaignContentVersion {
  return {
    id: `v${n}`, campaignId: "c1", version: n, subject: "Review your cover", preheader: "Before renewal",
    htmlBody: "<p>Hi</p>", textBody: "Hi\nBody", generatedBy: "test", createdAt: "2026-10-01T00:00:00Z", ...overrides,
  };
}

describe("compareContentVersions", () => {
  it("flags which parts changed and counts body lines", () => {
    const result = compareContentVersions(version(1), version(2, { subject: "New subject", textBody: "Hi\nBody\nPS" }));
    expect(result.subjectChanged).toBe(true);
    expect(result.preheaderChanged).toBe(false);
    expect(result.htmlChanged).toBe(false);
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(0);
  });
});

describe("defaultComparison", () => {
  it("compares approved against current when they differ", () => {
    expect(defaultComparison([1, 2, 3], 1, 3)).toEqual({ from: 1, to: 3 });
  });
  it("otherwise compares the previous version against the latest", () => {
    expect(defaultComparison([1, 2, 3], 3, 3)).toEqual({ from: 2, to: 3 });
    expect(defaultComparison([3, 1, 2])).toEqual({ from: 2, to: 3 });
  });
  it("returns nothing with fewer than two versions", () => {
    expect(defaultComparison([1], 1, 1)).toBeNull();
  });
});

describe("buildAudienceBreakdown", () => {
  const leads = [
    { id: "lead_a", businessName: "Acme Traders", contactFullName: "Ann Ace" },
    { id: "lead_b", contactFullName: "Bongani Bee" },
    { id: "lead_c", businessName: "Cape Co", contactFullName: "Cara Cee" },
    { id: "lead_x", businessName: "Other Broker Lead", contactFullName: "X" },
  ] as Lead[];
  const decisions = [
    { leadId: "lead_a", eligible: true, reasons: [] },
    { leadId: "lead_b", eligible: false, reasons: ["Marketing consent is not recorded", "Lead is marked do not contact"] },
    { leadId: "lead_c", eligible: false, reasons: ["Marketing consent is not recorded"] },
    { leadId: "lead_x", eligible: false, reasons: [NOT_ALLOCATED_REASON] },
  ];
  const recipients = [
    { id: "r1", campaignId: "c1", leadId: "lead_a", status: "sent", createdAt: "" },
    { id: "r2", campaignId: "c1", leadId: "lead_c", status: "suppressed", exclusionReason: "Eligibility changed before send: Recipient is suppressed", createdAt: "" },
  ] as CampaignRecipient[];

  it("counts reasons within the broker's book and keeps other brokers' leads to a count", () => {
    const result = buildAudienceBreakdown({ decisions, leads, recipients, showIdentity: true });
    expect(result.eligibleCount).toBe(1);
    expect(result.excludedCount).toBe(2);
    expect(result.notAllocatedCount).toBe(1);
    expect(result.reasons).toEqual([
      { reason: "Marketing consent is not recorded", count: 2 },
      { reason: "Lead is marked do not contact", count: 1 },
    ]);
    expect(result.rows.map((row) => row.label)).toEqual(["Bongani Bee", "Cape Co", "Acme Traders"]);
    expect(result.rows.some((row) => row.leadId === "lead_x")).toBe(false);
  });

  it("filters by reason or to eligible leads", () => {
    expect(buildAudienceBreakdown({ decisions, leads, recipients, showIdentity: true, reasonFilter: "Lead is marked do not contact" })
      .rows.map((row) => row.leadId)).toEqual(["lead_b"]);
    expect(buildAudienceBreakdown({ decisions, leads, recipients, showIdentity: true, reasonFilter: "eligible" })
      .rows.map((row) => row.leadId)).toEqual(["lead_a"]);
  });

  it("lists recipients removed at send time with their reason", () => {
    const result = buildAudienceBreakdown({ decisions, leads, recipients, showIdentity: true });
    expect(result.removedAtSend).toEqual([expect.objectContaining({
      leadId: "lead_c", label: "Cape Co", sendTimeReason: "Eligibility changed before send: Recipient is suppressed",
    })]);
  });

  it("hides identities for viewers who may not see lead detail", () => {
    const result = buildAudienceBreakdown({ decisions, leads, recipients, showIdentity: false });
    expect(result.rows.every((row) => row.label.startsWith("Lead …") && !row.linkable)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Bongani");
    expect(anonymousLeadReference("lead_1783455003252_tlxs5l")).toBe("Lead …TLXS5L");
  });
});
