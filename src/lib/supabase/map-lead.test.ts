import { describe, expect, it } from "vitest";
import { mapLead } from "./data";

type Row = Parameters<typeof mapLead>[0];

function row(insuranceProducts: string[], businessCoverInterests: string[] | null = null): Row {
  return {
    id: "lead-1", applicant_type: "individual", business_name: null, insurance_products: insuranceProducts,
    business_cover_interests: businessCoverInterests, contact_full_name: "Test Person",
    province: "Gauteng", city: "Johannesburg", status: "new", created_at: "2026-10-25T00:00:00Z",
  } as unknown as Row;
}

describe("mapLead product handling", () => {
  it("keeps catalogue products, including ones added after this code was written", () => {
    expect(mapLead(row(["motor_insurance"])).insuranceProducts).toEqual(["motor_insurance"]);
    expect(mapLead(row(["medical_aid"])).insuranceProducts).toEqual(["medical_aid"]);
    expect(mapLead(row(["a_product_added_later"])).insuranceProducts).toEqual(["a_product_added_later"]);
  });

  it("still converts leads from before the catalogue (cover areas stored as products)", () => {
    const legacy = mapLead(row(["public_liability", "cyber_insurance"]));
    expect(legacy.insuranceProducts).toEqual(["business_insurance"]);
    expect(legacy.businessCoverInterests).toEqual(["public_liability", "cyber_insurance"]);
  });
});
