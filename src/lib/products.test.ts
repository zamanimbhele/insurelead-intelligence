import { describe, expect, it } from "vitest";
import {
  FALLBACK_CATALOGUE,
  activeProducts,
  offeredCatalogue,
  productCounts,
  productFilterOptions,
  productLabel,
  unavailableProductIds,
  type ProductCatalogue,
} from "./products";
import { createConsultationFormSchema } from "./validation/consultationSchema";
import { createBrokerPreferencesSchema } from "./validation/brokerPreferences";

const ids = (products: { value: string }[]) => products.map((product) => product.value);

describe("activeProducts", () => {
  it("offers the eight current products and none of the prepared ones", () => {
    expect(ids(activeProducts(FALLBACK_CATALOGUE))).toEqual([
      "motor_insurance", "home_contents_insurance", "life_insurance", "funeral_cover",
      "travel_insurance", "personal_accident", "business_insurance", "general_insurance_review",
    ]);
  });

  it("filters by applicant type", () => {
    expect(ids(activeProducts(FALLBACK_CATALOGUE, "business"))).toEqual(["business_insurance", "general_insurance_review"]);
  });

  it("hides an active product whose category is hidden", () => {
    const catalogue: ProductCatalogue = {
      ...FALLBACK_CATALOGUE,
      products: FALLBACK_CATALOGUE.products.map((product) =>
        product.value === "medical_aid" ? { ...product, status: "active" } : product),
    };
    expect(ids(activeProducts(catalogue))).not.toContain("medical_aid");
    const launched: ProductCatalogue = {
      ...catalogue,
      categories: catalogue.categories.map((category) =>
        category.id === "medical_schemes" ? { ...category, status: "active" } : category),
    };
    expect(ids(activeProducts(launched))).toContain("medical_aid");
  });
});

describe("product availability", () => {
  it("names products that are unknown, hidden, or wrong for the applicant", () => {
    expect(unavailableProductIds(["motor_insurance"], FALLBACK_CATALOGUE, "individual")).toEqual([]);
    expect(unavailableProductIds(["medical_aid", "pet_insurance"], FALLBACK_CATALOGUE)).toEqual(["medical_aid", "pet_insurance"]);
    expect(unavailableProductIds(["motor_insurance"], FALLBACK_CATALOGUE, "business")).toEqual(["motor_insurance"]);
  });

  it("sends only offered products to the browser", () => {
    const offered = offeredCatalogue(FALLBACK_CATALOGUE);
    expect(ids(offered.products)).not.toContain("investment_planning");
    expect(offered.categories.map((category) => category.id)).toEqual(["short_term_insurance", "long_term_insurance"]);
  });
});

describe("labels and counts", () => {
  it("keeps names for hidden products and humanises unknown ids", () => {
    expect(productLabel("gap_cover")).toBe("Gap Cover");
    expect(productLabel("pet_insurance")).toBe("Pet insurance");
  });

  it("counts leads per product, including retired and unknown ones", () => {
    const retired: ProductCatalogue = {
      ...FALLBACK_CATALOGUE,
      products: FALLBACK_CATALOGUE.products.map((product) =>
        product.value === "travel_insurance" ? { ...product, status: "retired" } : product),
    };
    const leads = [
      { insuranceProducts: ["travel_insurance", "motor_insurance"] },
      { insuranceProducts: ["motor_insurance", "motor_insurance"] },
      { insuranceProducts: ["legacy_product"] },
    ];
    expect(productCounts(retired, leads)).toEqual([
      { value: "motor_insurance", label: "Motor Insurance", count: 2 },
      { value: "travel_insurance", label: "Travel Insurance", count: 1 },
      { value: "legacy_product", label: "Legacy product", count: 1 },
    ]);
    const options = productFilterOptions(retired, leads).map((option) => option.value);
    expect(options).toContain("travel_insurance");
    expect(options).toContain("legacy_product");
    expect(options).not.toContain("medical_aid");
  });
});

describe("validation built from the catalogue", () => {
  const lead = {
    applicantType: "individual", province: "Gauteng", city: "Johannesburg",
    insuranceProducts: ["motor_insurance"], currentInsuranceStatus: "insured", preferredContactChannel: "email",
    contactFullName: "Test Person", contactEmail: "test@example.co.za", contactMobile: "0821234567",
    preferredContactMethod: "email", privacyNoticeAccepted: true, contactConsent: true,
    partnerSharingConsent: true, accuracyConfirmed: true, nonBindingAcknowledged: true,
  };

  it("accepts an offered product and refuses a hidden one", () => {
    const schema = createConsultationFormSchema(FALLBACK_CATALOGUE);
    expect(schema.safeParse(lead).success).toBe(true);
    expect(schema.safeParse({ ...lead, insuranceProducts: ["medical_aid"] }).success).toBe(false);
  });

  it("accepts a product once the catalogue switches it on", () => {
    const launched: ProductCatalogue = {
      categories: FALLBACK_CATALOGUE.categories.map((category) => ({ ...category, status: "active" })),
      products: FALLBACK_CATALOGUE.products.map((product) => ({ ...product, status: "active" })),
    };
    expect(createConsultationFormSchema(launched).safeParse({ ...lead, insuranceProducts: ["medical_aid"] }).success).toBe(true);
  });

  it("limits broker appetite to the ids it is given", () => {
    const schema = createBrokerPreferencesSchema(["business_insurance"]);
    const base = { provinces: ["Gauteng"], minimumScore: 0, dailyLeadCapacity: 10, acceptsCampaigns: true, acceptsSharedLeads: false };
    expect(schema.safeParse({ ...base, insuranceProducts: ["business_insurance"] }).success).toBe(true);
    expect(schema.safeParse({ ...base, insuranceProducts: ["motor_insurance"] }).success).toBe(false);
  });
});
