// Generates synthetic (non-real) demo leads for the dashboard prototype.
// No real personal or business information is used anywhere in this file.
import { writeFileSync } from "fs";

// Mirrors src/lib/constants.ts's CONSENT_WORDING_VERSION. This script is
// plain Node ESM (not TypeScript), so it cannot import that constant
// directly - it is duplicated here as a literal, following this file's
// existing convention of re-declaring the few constants it needs (see the
// provinces/industries/etc. lists below) rather than reaching into
// src/lib/*.ts.
const CONSENT_WORDING_VERSION = "v3.0-2026-09-09-multi-product";
const CONSENT_SOURCE_URL = "https://www.insurelead-intelligence.co.za/request-a-business-insurance-consultation";

const provinces = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State", "Mpumalanga"];
const cities = {
  Gauteng: ["Johannesburg", "Pretoria", "Sandton", "Midrand"],
  "Western Cape": ["Cape Town", "Stellenbosch", "George"],
  "KwaZulu-Natal": ["Durban", "Pietermaritzburg"],
  "Eastern Cape": ["Gqeberha", "East London"],
  "Free State": ["Bloemfontein"],
  Mpumalanga: ["Nelspruit"],
};
// Synthetic suburb names only - used so the geographic hotspot dashboard's
// suburb-level breakdown has something to show in demo mode. Not sourced
// from any real business or resident data.
const suburbs = {
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
};
const industries = [
  "Retail and E-commerce", "Construction and Contracting", "Professional Services",
  "Manufacturing", "Hospitality and Tourism", "Transport and Logistics",
  "Healthcare and Wellness", "Agriculture", "Technology and IT Services", "Wholesale and Distribution",
];
const businessCovers = [
  "commercial_motor", "public_liability", "property_and_contents", "contractors_all_risk",
  "professional_indemnity", "business_interruption", "cyber_insurance",
  "stock_equipment_machinery", "employee_related_cover", "general_review_or_comparison",
];
const personalProducts = [
  "motor_insurance", "home_contents_insurance", "life_insurance", "funeral_cover",
  "travel_insurance", "personal_accident", "general_insurance_review",
];
const statuses = [
  "new", "contact_attempted", "contacted", "qualified", "consultation_booked",
  "quote_requested", "quote_issued", "negotiation", "won", "lost", "nurture",
];
const campaigns = ["google-ads-fye-review", "linkedin-smb-q3", "referral-partner-network", "organic-search", "webinar-cyber-risk"];
const brokers = ["Naledi Khumalo", "Johan van der Merwe", "Aisha Patel", "Sipho Dlamini"];
const employeeBands = ["1-5", "6-20", "21-50", "51-200", "200+"];
const turnoverBands = ["Under R1 million", "R1 million - R5 million", "R5 million - R20 million", "R20 million - R50 million", "R50 million+"];
const businessNamePrefixes = ["Karoo", "Baobab", "Highveld", "Coastal", "Summit", "Ubuntu", "Ridgeline", "Horizon", "Vantage", "Longview", "Silverleaf", "Metro", "Kalahari", "Fynbos", "Delta"];
const businessNameSuffixes = ["Logistics", "Construction", "Consulting", "Retail Group", "Manufacturing", "Trading", "Solutions", "Hospitality", "Technologies", "Distributors", "Contractors", "Services"];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const leads = [];
// Every synthetic lead gets a matching consent record, mirroring the real
// public consultation form (src/app/api/leads/route.ts), so demo-mode
// compliance metrics (consent coverage, etc.) reflect a realistic, fully
// consented pipeline instead of reading near-zero on freshly generated seed
// data. All five fields isConsentValid() requires (src/lib/lead-utils.ts)
// are set true for every lead - this generator is not trying to model
// invalid/missing consent, only to give the demo data a believable base.
const consents = [];
const total = 64;
for (let i = 0; i < total; i++) {
  const province = rand(provinces);
  const city = rand(cities[province]);
  const suburb = rand(suburbs[city] ?? [city]);
  const applicantType = Math.random() < 0.7 ? "business" : "individual";
  const industry = rand(industries);
  const status = rand(statuses);
  const numProducts = randInt(1, 3);
  const chosenBusinessCovers = Array.from(new Set(Array.from({ length: numProducts }, () => rand(businessCovers))));
  const chosenProducts = applicantType === "business"
    ? ["business_insurance"]
    : Array.from(new Set(Array.from({ length: Math.min(numProducts, 2) }, () => rand(personalProducts))));
  const daysAgo = randInt(0, 120);
  const score = randInt(10, 96);
  const band = score >= 70 ? "hot" : score >= 45 ? "warm" : score >= 20 ? "nurture" : "low_priority";
  const leadId = `lead_${String(i + 1).padStart(4, "0")}`;
  const createdAt = pastDate(daysAgo);

  leads.push({
    id: leadId,
    applicantType,
    ...(applicantType === "business" ? {
      businessName: `${rand(businessNamePrefixes)} ${rand(businessNameSuffixes)}`,
      industry,
      businessType: "Private Company (Pty Ltd)",
      employeeBand: rand(employeeBands),
      turnoverBand: rand(turnoverBands),
      yearsInOperation: rand(["1-3 years", "4-10 years", "11-20 years", "20+ years"]),
      businessCoverInterests: chosenBusinessCovers,
    } : {}),
    province,
    city,
    suburb,
    insuranceProducts: chosenProducts,
    currentInsuranceStatus: rand(["currently_insured", "not_currently_insured", "reviewing_existing_cover", "starting_new_business", "unsure"]),
    preferredContactChannel: rand(["phone", "email", "whatsapp"]),
    contactFullName: "Demo Contact",
    ...(applicantType === "business" ? { contactRole: rand(["Owner", "Financial Manager", "Operations Manager", "Director"]) } : {}),
    contactEmail: `demo.contact+${i + 1}@example-synthetic.co.za`,
    contactMobile: `08${randInt(1, 9)}${randInt(1000000, 9999999)}`,
    status,
    score,
    scoreBand: band,
    scoreExplanation: `Lead scored ${score}/100 based on synthetic demo attributes for prototype purposes.`,
    campaignSource: rand(campaigns),
    utm: { source: rand(["google", "linkedin", "referral", "organic"]), medium: rand(["cpc", "social", "referral", "organic"]), campaign: rand(campaigns) },
    doNotContact: Math.random() < 0.05,
    assignedBroker: rand(brokers),
    financialYearEndMonth: rand(["February", "March", "June", "December"]),
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
    sourceUrl: CONSENT_SOURCE_URL,
    timestamp: createdAt,
  });
}

writeFileSync(new URL("../data/leads.json", import.meta.url), JSON.stringify(leads, null, 2));
console.log(`Generated ${leads.length} synthetic demo leads -> data/leads.json`);

writeFileSync(new URL("../data/consents.json", import.meta.url), JSON.stringify(consents, null, 2));
console.log(`Generated ${consents.length} synthetic consent records -> data/consents.json`);
