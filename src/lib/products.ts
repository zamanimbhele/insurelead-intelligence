// The product catalogue: which products exist, which regulated category
// each belongs to, and whether it is offered (active), prepared but not
// yet offered (hidden), or withdrawn (retired).
//
// The database table public.insurance_products is the source of truth in
// Supabase mode (see src/lib/product-catalogue.ts). FALLBACK_CATALOGUE
// below mirrors its seed exactly and serves demo mode, tests, and the
// rare case the catalogue cannot be read - product-catalogue.test.ts
// fails if the two drift apart. This module is safe to import in client
// components: it holds data and pure helpers only.
import type { ApplicantType } from "./types.ts";

export type ProductStatus = "active" | "hidden" | "retired";

export type ProductCategory = {
  id: string;
  name: string;
  description: string;
  requiredAuthorisation: string;
  status: ProductStatus;
  displayOrder: number;
  // Phase 3: evidence a person may give to be authorised for this
  // category, and guidance shown with the form. The guidance is demo
  // placeholder text until a compliance officer confirms it.
  acceptedEvidence: string[];
  evidenceGuidance: string;
  guidanceIsPlaceholder: boolean;
};

export type CatalogueProduct = {
  value: string;
  label: string;
  description: string;
  applicantTypes: ApplicantType[];
  categoryId: string;
  status: ProductStatus;
  displayOrder: number;
};

export type ProductCatalogue = {
  categories: ProductCategory[];
  products: CatalogueProduct[];
};

// Same rule as the product_categories id check in the migration.
export const PRODUCT_ID_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

export const FALLBACK_CATALOGUE: ProductCatalogue = {
  categories: [
    { id: "short_term_insurance", name: "Short-term insurance", description: "Cover for vehicles, property, businesses, travel and accidents.", requiredAuthorisation: "fais_short_term", status: "active", displayOrder: 10,
      acceptedEvidence: ["fsp_licence", "representative_appointment"], evidenceGuidance: "Your own FSP licence number if you are licensed for short-term insurance, or the name and FSP number of the financial services provider that appointed you as its representative. Representatives should appear on the FSCA register under that FSP.", guidanceIsPlaceholder: true },
    { id: "long_term_insurance", name: "Life and funeral cover", description: "Life, funeral and other long-term cover.", requiredAuthorisation: "fais_long_term", status: "active", displayOrder: 20,
      acceptedEvidence: ["fsp_licence", "representative_appointment"], evidenceGuidance: "Your own FSP licence number if you are licensed for long-term insurance (life, funeral and disability cover), or the name and FSP number of the financial services provider that appointed you as its representative.", guidanceIsPlaceholder: true },
    { id: "investments", name: "Investments and retirement", description: "Investment and retirement planning advice.", requiredAuthorisation: "fais_investments", status: "hidden", displayOrder: 30,
      acceptedEvidence: ["fsp_licence", "representative_appointment"], evidenceGuidance: "Your FSP licence number, or the FSP you represent, showing authorisation for investment products such as unit trusts and retirement annuities. Investment categories usually carry extra experience and qualification requirements.", guidanceIsPlaceholder: true },
    { id: "medical_schemes", name: "Medical aid", description: "Medical scheme membership and gap cover.", requiredAuthorisation: "cms_accreditation", status: "hidden", displayOrder: 40,
      acceptedEvidence: ["cms_accreditation"], evidenceGuidance: "Your broker accreditation number from the Council for Medical Schemes, and the FSP you act for. Medical aid also requires FAIS authorisation for health service benefits.", guidanceIsPlaceholder: true },
    { id: "banking_credit", name: "Banking and credit", description: "Banking and credit products.", requiredAuthorisation: "banking_or_credit_mandate", status: "hidden", displayOrder: 50,
      acceptedEvidence: ["ncr_registration", "bank_mandate"], evidenceGuidance: "Your National Credit Regulator registration number, or the bank or credit provider that mandated you to offer its products.", guidanceIsPlaceholder: true },
  ],
  products: [
    { value: "motor_insurance", label: "Motor Insurance", description: "Cover options for personal vehicles.", applicantTypes: ["individual"], categoryId: "short_term_insurance", status: "active", displayOrder: 10 },
    { value: "home_contents_insurance", label: "Home & Contents", description: "Protection for a home and its contents.", applicantTypes: ["individual"], categoryId: "short_term_insurance", status: "active", displayOrder: 20 },
    { value: "life_insurance", label: "Life Insurance", description: "Financial protection for the people who depend on you.", applicantTypes: ["individual"], categoryId: "long_term_insurance", status: "active", displayOrder: 30 },
    { value: "funeral_cover", label: "Funeral Cover", description: "Cover intended to help with funeral expenses.", applicantTypes: ["individual"], categoryId: "long_term_insurance", status: "active", displayOrder: 40 },
    { value: "travel_insurance", label: "Travel Insurance", description: "Cover options for domestic and international travel.", applicantTypes: ["individual"], categoryId: "short_term_insurance", status: "active", displayOrder: 50 },
    { value: "personal_accident", label: "Personal Accident", description: "Cover options following specified accidental injury events.", applicantTypes: ["individual"], categoryId: "short_term_insurance", status: "active", displayOrder: 60 },
    { value: "business_insurance", label: "Business Insurance", description: "Commercial cover options shaped around business risks.", applicantTypes: ["business"], categoryId: "short_term_insurance", status: "active", displayOrder: 70 },
    { value: "general_insurance_review", label: "Insurance Review", description: "A general review when you are unsure which product fits.", applicantTypes: ["individual", "business"], categoryId: "short_term_insurance", status: "active", displayOrder: 80 },
    { value: "investment_planning", label: "Investment Planning", description: "Advice on growing savings and investments.", applicantTypes: ["individual"], categoryId: "investments", status: "hidden", displayOrder: 90 },
    { value: "retirement_planning", label: "Retirement Planning", description: "Planning income for retirement.", applicantTypes: ["individual"], categoryId: "investments", status: "hidden", displayOrder: 100 },
    { value: "medical_aid", label: "Medical Aid", description: "Medical scheme options for individuals, families and employers.", applicantTypes: ["individual", "business"], categoryId: "medical_schemes", status: "hidden", displayOrder: 110 },
    { value: "gap_cover", label: "Gap Cover", description: "Cover for the shortfall between medical costs and scheme benefits.", applicantTypes: ["individual"], categoryId: "medical_schemes", status: "hidden", displayOrder: 120 },
  ],
};

// Products people can choose today: active, in an active category, in
// display order, optionally only those offered to one applicant type.
export function activeProducts(catalogue: ProductCatalogue, applicantType?: ApplicantType): CatalogueProduct[] {
  const activeCategories = new Set(catalogue.categories.filter((category) => category.status === "active").map((category) => category.id));
  return catalogue.products
    .filter((product) => product.status === "active" && activeCategories.has(product.categoryId))
    .filter((product) => !applicantType || product.applicantTypes.includes(applicantType))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
}

export function activeProductIds(catalogue: ProductCatalogue): string[] {
  return activeProducts(catalogue).map((product) => product.value);
}

export function humaniseProductId(id: string): string {
  const words = id.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

// Labels for every product ever offered (hidden and retired included),
// so older leads and campaigns keep showing a proper name.
export function productLabelMap(catalogue: ProductCatalogue): Map<string, string> {
  return new Map(catalogue.products.map((product) => [product.value, product.label]));
}

export function productLabel(id: string, catalogue: ProductCatalogue = FALLBACK_CATALOGUE): string {
  return catalogue.products.find((product) => product.value === id)?.label ?? humaniseProductId(id);
}

// Ids not offered right now (unknown, hidden or retired). Empty = all fine.
export function unavailableProductIds(ids: readonly string[], catalogue: ProductCatalogue, applicantType?: ApplicantType): string[] {
  const offered = new Set(activeProducts(catalogue, applicantType).map((product) => product.value));
  return ids.filter((id) => !offered.has(id));
}

// Only what is offered today, for pages that send the catalogue to the
// browser: hidden (not yet launched) products stay on the server.
export function offeredCatalogue(catalogue: ProductCatalogue): ProductCatalogue {
  const products = activeProducts(catalogue);
  const categoryIds = new Set(products.map((product) => product.categoryId));
  return { categories: catalogue.categories.filter((category) => categoryIds.has(category.id)), products };
}

// How many leads asked about each product, for products with at least
// one lead (any status, so leads for a since-retired product still count).
export function productCounts(catalogue: ProductCatalogue, leads: readonly { insuranceProducts: readonly string[] }[]) {
  const counts = new Map<string, number>();
  for (const lead of leads) for (const id of new Set(lead.insuranceProducts)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const known = [...catalogue.products].sort((a, b) => a.displayOrder - b.displayOrder);
  const knownIds = new Set(known.map((product) => product.value));
  return [
    ...known.map((product) => ({ value: product.value, label: product.label, count: counts.get(product.value) ?? 0 })),
    ...[...counts.keys()].filter((id) => !knownIds.has(id)).map((id) => ({ value: id, label: humaniseProductId(id), count: counts.get(id) ?? 0 })),
  ].filter((product) => product.count > 0);
}

// Options for a "filter by product" control: what is offered today plus
// anything the given leads mention, so older leads stay findable.
export function productFilterOptions(catalogue: ProductCatalogue, leads: readonly { insuranceProducts: readonly string[] }[] = []) {
  const mentioned = new Set(leads.flatMap((lead) => lead.insuranceProducts));
  const offered = new Set(activeProducts(catalogue).map((product) => product.value));
  const labels = productLabelMap(catalogue);
  const ids = [
    ...[...catalogue.products].sort((a, b) => a.displayOrder - b.displayOrder).map((product) => product.value)
      .filter((id) => offered.has(id) || mentioned.has(id)),
    ...[...mentioned].filter((id) => !labels.has(id)),
  ];
  return ids.map((id) => ({ value: id, label: labels.get(id) ?? humaniseProductId(id) }));
}
