import { z } from "zod";
import { PROVINCES } from "../constants";
import { FALLBACK_CATALOGUE, activeProductIds } from "../products.ts";

// Shared by the admin API route (server-side authority) and the Broker
// Directory appetite editor (client-side early feedback). Mirrors the
// checks in update_buyer_preferences() (migration 202610180001) so a
// rejection reads the same whichever layer catches it.
// Built from the ids of products offered today (the catalogue), so the
// route and the editor agree with update_buyer_preferences().
export function createBrokerPreferencesSchema(productIds: readonly string[]) {
  const productValues = (productIds.length ? productIds : ["__none__"]) as [string, ...string[]];
  return z
  .object({
    insuranceProducts: z.array(z.enum(productValues, { error: "Insurance product is not recognised" })).max(productValues.length),
    provinces: z.array(z.enum(PROVINCES as [string, ...string[]])).max(PROVINCES.length),
    minimumScore: z.number().int("Minimum score must be a whole number").min(0).max(100),
    dailyLeadCapacity: z.number().int("Daily capacity must be a whole number").min(1).max(1000),
    acceptsCampaigns: z.boolean(),
    acceptsSharedLeads: z.boolean(),
    // Optional so older clients (and the 7-argument RPC call shape) keep
    // working: omitted means "keep the current limit".
    campaignDailySendLimit: z.number().int("Daily send limit must be a whole number").min(1).max(50000).optional(),
    campaignMonthlySendLimit: z.number().int("Monthly send limit must be a whole number").min(1).max(1000000).optional(),
  })
  .refine(
    (value) => value.campaignDailySendLimit === undefined
      || value.campaignMonthlySendLimit === undefined
      || value.campaignDailySendLimit <= value.campaignMonthlySendLimit,
    { message: "Daily campaign send limit cannot exceed the monthly limit", path: ["campaignDailySendLimit"] },
  )
  .refine((value) => !value.acceptsCampaigns || value.insuranceProducts.length > 0, {
    message: "Campaigns require at least one approved insurance product",
    path: ["acceptsCampaigns"],
  });
}

export const brokerPreferencesSchema = createBrokerPreferencesSchema(activeProductIds(FALLBACK_CATALOGUE));

export type BrokerPreferencesInput = z.infer<typeof brokerPreferencesSchema>;
