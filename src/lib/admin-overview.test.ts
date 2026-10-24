import { describe, expect, it } from "vitest";
import { buildAdminOverview } from "./admin-overview";
import type { BrokerMember, Buyer, Lead, BrokerSendingIdentity } from "./types";

describe("buildAdminOverview", () => {
  it("counts what needs an administrator's attention", () => {
    const result = buildAdminOverview({
      buyers: [
        { status: "pending", onboardingStatus: "pending" },
        { status: "pending", onboardingStatus: "in_review" },
        { status: "active", onboardingStatus: "approved" },
        { status: "suspended", onboardingStatus: "rejected" },
      ] as Buyer[],
      sendingIdentities: [{ status: "pending" }, { status: "verified" }] as BrokerSendingIdentity[],
      members: [{ status: "invited" }, { status: "active" }, { status: "invited" }] as BrokerMember[],
      leads: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d", deletedAt: "2026-10-01" }] as Lead[],
      isUnassigned: (lead) => lead.id !== "a",
    });
    expect(result).toEqual({
      brokersAwaitingReview: 2,
      activeBrokers: 1,
      identitiesAwaitingVerification: 1,
      invitedMembers: 2,
      liveLeads: 3,
      unassignedLeads: 2,
    });
  });
});
