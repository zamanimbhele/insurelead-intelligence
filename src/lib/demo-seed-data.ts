// Single source of truth for InsureLead Intelligence's synthetic demo
// lead and consent dataset. Shared by scripts/generate-seed.mjs (the
// documented `npm run seed:demo` CLI entrypoint) and resetDemoData() in
// demo-store.ts (the in-app, admin-only "Reset demo data" action - see
// BACKLOG.md's "Demo data reset process and seeded demo accounts per
// role" item). One generator means the two call sites can never quietly
// drift apart from each other, the same reasoning that already applies
// to aggregation-utils.ts being shared by the hotspot and industry
// dashboards.
//
// Intentionally non-deterministic (Math.random(), no fixed seed): a seed
// run or a reset is meant to produce a fresh, realistic, fully-synthetic
// dataset each time, not reproduce byte-identical content run to run.
// No real business or personal information is used anywhere in this
// file - every name, email, and phone number below is synthetic.
import type { ConsentRecord, CurrentInsuranceStatus, Lead } from "./types.ts";
import {
  BUSINESS_COVER_OPTIONS,
  CONSENT_WORDING_VERSION,
  CURRENT_INSURANCE_STATUS,
  EMPLOYEE_BANDS,
  INDUSTRIES,
  INSURANCE_PRODUCTS,
  LEAD_STATUS_ORDER,
  MONTHS,
  PROVINCES,
  TURNOVER_BANDS,
  YEARS_IN_OPERATION,
} from "./constants.ts";

export const DEMO_SEED_LEAD_COUNT = 64;

export const DEMO_SEED_CONSENT_SOURCE_URL =
  "https://www.insurelead-intelligence.co.za/request-a-business-insurance-consultation";

// Synthetic city/suburb names only, covering every province in
// PROVINCES (src/lib/constants.ts) so every province can appear in demo
// data - not sourced from any real business or resident data.
const CITIES_BY_PROVINCE: Record<string, string[]> = {
  "Eastern Cape": ["Gqeberha", "East London"],
  "Free State": ["Bloemfontein"],
  Gauteng: ["Johannesburg", "Pretoria", "Sandton", "Midrand"],
  "KwaZulu-Natal": ["Durban", "Pietermaritzburg"],
  Limpopo: ["Polokwane"],
  Mpumalanga: ["Nelspruit"],
  "North West": ["Rustenburg"],
  "Northern Cape": ["Kimberley"],
  "Western Cape": ["Cape Town", "Stellenbosch", "George"],
};

const SUBURBS_BY_CITY: Record<string, string[]> = {
  Johannesburg: ["Rosebank", "Randburg"],
  Pretoria: ["Hatfield", "Centurion"],
  Sandton: ["Bryanston", "Morningside"],
  Midrand: ["Noordwyk", "Carlswald"],
  "Cape Town": ["Claremont", "Woodstock"],
  Stellenbosch: ["Die Boord", "Paradyskloof"],
  George: ["Blanco", "Denneoord"],
  Durban: ["Morningside", "Umhlanga"],
  Pietermaritzburg: ["Hayfields", "Ashburton"],
  Gqeberha: ["Walmer", "Summerstrand"],
  "East London": ["Vincent", "Beacon Bay"],
  Bloemfontein: ["Westdene", "Universitas"],
  Nelspruit: ["Sonheuwel", "West Acres"],
  Polokwane: ["Bendor", "Fauna Park"],
  Rustenburg: ["Cashan", "Safarituine"],
  Kimberley: ["Hadison Park", "Royldene"],
};

const CAMPAIGN_SOURCES = [
  "google-ads-fye-review",
  "linkedin-smb-q3",
  "referral-partner-network",
  "organic-search",
  "webinar-cyber-risk",
];
// Cosmetic display names only (Lead.assignedBroker is a free-text label,
// not a source of truth for access control - see BACKLOG.md's "demo-data
// accuracy fixes" item). Deliberately distinct from DEMO_ROLE_ACCOUNTS'
// names in constants.ts so the two concepts never look like the same
// person.
const ASSIGNED_BROKER_NAMES = ["Naledi Khumalo", "Johan van der Merwe", "Aisha Patel", "Sipho Dlamini"];
const BUSINESS_NAME_PREFIXES = [
  "Karoo", "Baobab", "Highveld", "Coastal", "Summit", "Ubuntu", "Ridgeline",
  "Horizon", "Vantage", "Longview", "Silverleaf", "Metro", "Kalahari", "Fynbos", "Delta",
];
const BUSINESS_NAME_SUFFIXES = [
  "Logistics", "Construction", "Consulting", "Retail Group", "Manufacturing",
  "Trading", "Solutions", "Hospitality", "Technologies", "Distributors", "Contractors", "Services",
];

// Excludes do_not_contact and archived: a freshly generated lead should
// start somewhere in the active pipeline, not already parked at the end
// of it.
const SEED_STATUSES = LEAD_STATUS_ORDER.filter((status) => status !== "do_not_contact" && status !== "archived");
const BUSINESS_COVER_VALUES = BUSINESS_COVER_OPTIONS.map((option) => option.value);
const PERSONAL_PRODUCT_VALUES = INSURANCE_PRODUCTS.filter((product) => product.applicantTypes.includes("individual")).map((product) => product.value);
const CURRENT_INSURANCE_STATUS_VALUES = CURRENT_INSURANCE_STATUS.map((option) => option.value as CurrentInsuranceStatus);

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

export function generateSyntheticLeadSeed(count: number = DEMO_SEED_LEAD_COUNT): { leads: Lead[]; consents: ConsentRecord[] } {
  const leads: Lead[] = [];
  const consents: ConsentRecord[] = [];

  for (let i = 0; i < count; i++) {
    const province = rand(PROVINCES);
    const city = rand(CITIES_BY_PROVINCE[province] ?? [province]);
    const suburb = rand(SUBURBS_BY_CITY[city] ?? [city]);
    const applicantType: Lead["applicantType"] = Math.random() < 0.7 ? "business" : "individual";
    const industry = rand(INDUSTRIES);
    const status = rand(SEED_STATUSES);
    const numProducts = randInt(1, 3);
    const chosenBusinessCovers = Array.from(new Set(Array.from({ length: numProducts }, () => rand(BUSINESS_COVER_VALUES))));
    const chosenProducts: Lead["insuranceProducts"] = applicantType === "business"
      ? ["business_insurance"]
      : Array.from(new Set(Array.from({ length: Math.min(numProducts, 2) }, () => rand(PERSONAL_PRODUCT_VALUES))));
    const daysAgo = randInt(0, 120);
    const score = randInt(10, 96);
    const band = score >= 70 ? "hot" : score >= 45 ? "warm" : score >= 20 ? "nurture" : "low_priority";
    const leadId = `lead_${String(i + 1).padStart(4, "0")}`;
    const createdAt = pastDate(daysAgo);

    leads.push({
      id: leadId,
      applicantType,
      ...(applicantType === "business" ? {
        businessName: `${rand(BUSINESS_NAME_PREFIXES)} ${rand(BUSINESS_NAME_SUFFIXES)}`,
        industry,
        businessType: "Private Company (Pty Ltd)",
        employeeBand: rand(EMPLOYEE_BANDS),
        turnoverBand: rand(TURNOVER_BANDS),
        yearsInOperation: rand(YEARS_IN_OPERATION),
        businessCoverInterests: chosenBusinessCovers,
      } : {}),
      province,
      city,
      suburb,
      insuranceProducts: chosenProducts,
      currentInsuranceStatus: rand(CURRENT_INSURANCE_STATUS_VALUES),
      // Renewal month, independent of financial-year-end: not every lead
      // has disclosed one yet (unsure/new-business leads often haven't),
      // the same honesty convention as the Industry Opportunity
      // dashboard's "no renewal dates captured yet" state - see
      // src/lib/industries.ts. Previously missing entirely from this
      // generator (a one-off deterministic backfill patched the already-
      // committed data/leads.json instead - see BACKLOG.md); fixed at
      // the source here so every future seed/reset has it from the start.
      ...(Math.random() < 0.7 ? { renewalMonth: rand(MONTHS) } : {}),
      financialYearEndMonth: rand(["February", "March", "June", "December"]),
      preferredContactChannel: rand(["phone", "email", "whatsapp"]),
      contactFullName: "Demo Contact",
      ...(applicantType === "business" ? { contactRole: rand(["Owner", "Financial Manager", "Operations Manager", "Director"]) } : {}),
      contactEmail: `demo.contact+${i + 1}@example-synthetic.co.za`,
      contactMobile: `08${randInt(1, 9)}${randInt(1000000, 9999999)}`,
      status,
      score,
      scoreBand: band,
      scoreExplanation: `Lead scored ${score}/100 based on synthetic demo attributes for prototype purposes.`,
      campaignSource: rand(CAMPAIGN_SOURCES),
      utm: { source: rand(["google", "linkedin", "referral", "organic"]), medium: rand(["cpc", "social", "referral", "organic"]), campaign: rand(CAMPAIGN_SOURCES) },
      doNotContact: Math.random() < 0.05,
      assignedBroker: rand(ASSIGNED_BROKER_NAMES),
      createdAt,
    });

    consents.push({
      leadId,
      privacyNoticeAccepted: true,
      contactConsent: true,
      marketingConsent: Math.random() < 0.6,
      partnerSharingConsent: true,
      maxPartnerRecipients: Math.random() < 0.5 ? 1 : 3,
      accuracyConfirmed: true,
      nonBindingAcknowledged: true,
      consentWordingVersion: CONSENT_WORDING_VERSION,
      sourceUrl: DEMO_SEED_CONSENT_SOURCE_URL,
      timestamp: createdAt,
    });
  }

  return { leads, consents };
}
