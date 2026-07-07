// Generates synthetic (non-real) demo leads for the dashboard prototype.
// No real personal or business information is used anywhere in this file.
import { writeFileSync } from "fs";

const provinces = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State", "Mpumalanga"];
const cities = {
  Gauteng: ["Johannesburg", "Pretoria", "Sandton", "Midrand"],
  "Western Cape": ["Cape Town", "Stellenbosch", "George"],
  "KwaZulu-Natal": ["Durban", "Pietermaritzburg"],
  "Eastern Cape": ["Gqeberha", "East London"],
  "Free State": ["Bloemfontein"],
  Mpumalanga: ["Nelspruit"],
};
const industries = [
  "Retail and E-commerce", "Construction and Contracting", "Professional Services",
  "Manufacturing", "Hospitality and Tourism", "Transport and Logistics",
  "Healthcare and Wellness", "Agriculture", "Technology and IT Services", "Wholesale and Distribution",
];
const products = [
  "commercial_motor", "public_liability", "property_and_contents", "contractors_all_risk",
  "professional_indemnity", "business_interruption", "cyber_insurance",
  "stock_equipment_machinery", "employee_related_cover", "general_review_or_comparison",
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
const total = 64;
for (let i = 0; i < total; i++) {
  const province = rand(provinces);
  const city = rand(cities[province]);
  const industry = rand(industries);
  const status = rand(statuses);
  const numProducts = randInt(1, 3);
  const chosenProducts = Array.from(new Set(Array.from({ length: numProducts }, () => rand(products))));
  const daysAgo = randInt(0, 120);
  const score = randInt(10, 96);
  const band = score >= 70 ? "hot" : score >= 45 ? "warm" : score >= 20 ? "nurture" : "low_priority";

  leads.push({
    id: `lead_${String(i + 1).padStart(4, "0")}`,
    businessName: `${rand(businessNamePrefixes)} ${rand(businessNameSuffixes)}`,
    industry,
    businessType: "Private Company (Pty Ltd)",
    employeeBand: rand(employeeBands),
    turnoverBand: rand(turnoverBands),
    yearsInOperation: rand(["1-3 years", "4-10 years", "11-20 years", "20+ years"]),
    province,
    city,
    insuranceProducts: chosenProducts,
    currentInsuranceStatus: rand(["currently_insured", "not_currently_insured", "reviewing_existing_cover", "starting_new_business", "unsure"]),
    preferredContactChannel: rand(["phone", "email", "whatsapp"]),
    contactFullName: "Demo Contact",
    contactRole: rand(["Owner", "Financial Manager", "Operations Manager", "Director"]),
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
    createdAt: pastDate(daysAgo),
  });
}

writeFileSync(new URL("../data/leads.json", import.meta.url), JSON.stringify(leads, null, 2));
console.log(`Generated ${leads.length} synthetic demo leads -> data/leads.json`);
