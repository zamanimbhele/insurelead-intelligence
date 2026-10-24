// Counts for the Admin Portal home. Pure, so it is unit-tested; the page
// feeds it the same data the Broker Directory and Lead Marketplace use.
import type { BrokerMember, Buyer, Lead, BrokerSendingIdentity } from "./types.ts";

export type AdminOverview = {
  brokersAwaitingReview: number;
  activeBrokers: number;
  identitiesAwaitingVerification: number;
  invitedMembers: number;
  liveLeads: number;
  unassignedLeads: number;
};

export function buildAdminOverview(input: {
  buyers: Buyer[];
  sendingIdentities: BrokerSendingIdentity[];
  members: BrokerMember[];
  leads: Lead[];
  // The platform's one definition of "unassigned" (isLeadUnassigned in
  // dashboard-data.ts), passed in so the admin home and the overview page
  // can never disagree.
  isUnassigned: (lead: Lead) => boolean;
}): AdminOverview {
  const liveLeads = input.leads.filter((lead) => !lead.deletedAt);
  return {
    brokersAwaitingReview: input.buyers.filter((buyer) =>
      buyer.onboardingStatus === "pending" || buyer.onboardingStatus === "in_review").length,
    activeBrokers: input.buyers.filter((buyer) => buyer.status === "active").length,
    identitiesAwaitingVerification: input.sendingIdentities.filter((identity) => identity.status === "pending").length,
    invitedMembers: input.members.filter((member) => member.status === "invited").length,
    liveLeads: liveLeads.length,
    unassignedLeads: liveLeads.filter(input.isUnassigned).length,
  };
}
