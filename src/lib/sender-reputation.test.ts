import { describe, expect, it } from "vitest";
import { pauseReason, platformSenderAddress, platformSendingDomain, senderReputation, warmUpDailyCap } from "./sender-reputation";
import type { CampaignRecipient } from "./types";

const NOW = new Date("2026-10-26T12:00:00Z");
function recipients(counts: Partial<Record<CampaignRecipient["status"], number>>, sentAt = "2026-10-20T08:00:00Z") {
  return Object.entries(counts).flatMap(([status, count]) => Array.from({ length: count ?? 0 }, (_, index) => ({
    id: `${status}-${index}`, campaignId: "c1", leadId: `l-${status}-${index}`, status, createdAt: sentAt, sentAt,
  }) as CampaignRecipient));
}

describe("sender reputation", () => {
  it("counts dispatched emails in the last 30 days only", () => {
    const stats = senderReputation([...recipients({ delivered: 8, bounced: 2, queued: 5 }), ...recipients({ delivered: 50 }, "2026-08-01T00:00:00Z")], NOW);
    expect(stats).toEqual({ sent: 10, bounced: 2, complained: 0, bounceRate: 0.2, complaintRate: 0 });
  });

  it("does not judge bounces on small volumes", () => {
    expect(pauseReason(senderReputation(recipients({ delivered: 30, bounced: 10 }), NOW))).toBeNull();
  });

  it("pauses on a bounce rate above 5% once there are 50 sends", () => {
    expect(pauseReason(senderReputation(recipients({ delivered: 94, bounced: 6 }), NOW))).toMatch(/6 bounces \(6\.0%\)/);
    expect(pauseReason(senderReputation(recipients({ delivered: 96, bounced: 4 }), NOW))).toBeNull();
  });

  it("needs two complaints above 0.3% before pausing", () => {
    expect(pauseReason(senderReputation(recipients({ delivered: 99, complained: 1 }), NOW))).toBeNull();
    expect(pauseReason(senderReputation(recipients({ delivered: 98, complained: 2 }), NOW))).toMatch(/2 spam complaints \(2\.0%\)/);
    expect(pauseReason(senderReputation(recipients({ delivered: 998, complained: 2 }), NOW))).toBeNull();
  });
});

describe("warm-up and addresses", () => {
  it("raises the daily cap as a platform sender ages", () => {
    expect(warmUpDailyCap("2026-10-24T00:00:00Z", NOW)).toBe(50);
    expect(warmUpDailyCap("2026-10-16T00:00:00Z", NOW)).toBe(100);
    expect(warmUpDailyCap("2026-10-01T00:00:00Z", NOW)).toBe(250);
    expect(warmUpDailyCap("2026-09-01T00:00:00Z", NOW)).toBeUndefined();
  });

  it("builds the same address as the database", () => {
    expect(platformSenderAddress({ displayName: "Lerato Ndlovu", organisationId: "1a2b3c4d-0000-0000-0000-000000000000", domain: "mail.insurelead.online" }))
      .toEqual({ fromName: "Lerato Ndlovu via InsureLead", fromEmail: "lerato-ndlovu-1a2b3c4d@mail.insurelead.online" });
  });

  it("uses the configured domain only when it is valid", () => {
    expect(platformSendingDomain(" Mail.InsureLead.online ", false)).toBe("mail.insurelead.online");
    expect(platformSendingDomain("not a domain", false)).toBeNull();
    expect(platformSendingDomain(undefined, false)).toBeNull();
    expect(platformSendingDomain(undefined, true)).toMatch(/example-synthetic/);
  });
});
