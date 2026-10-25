// Database behaviour for per-person authorisation (migration
// 202610250003_practitioner_authorisations.sql), run against every
// migration in an in-memory Postgres.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase } from "./testing/supabase-db";

let db: PGlite;
const ADMIN = "00000000-0000-0000-0000-00000000a001";
const ADVISOR = "00000000-0000-0000-0000-00000000b001";
const COLLEAGUE = "00000000-0000-0000-0000-00000000b002";
let org = "";

async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
const submit = (category: string, evidence: string, reference = "FSP 12345", expires: string | null = null) =>
  one<{ result: { id: string } }>(
    "select public.submit_authorisation($1, $2, $3, 'Example Life FSP', null, $4::date) as result",
    [category, evidence, reference, expires],
  ).then((row) => row.result.id);
const review = (id: string, decision: string, note: string | null = null) =>
  db.query("select public.review_authorisation($1, $2, $3)", [id, decision, note]);
const authorisedProducts = async () =>
  (await one<{ products: string[] }>("select public.organisation_authorised_products($1) as products", [org])).products;

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.co.za')", [ADMIN]);
  await db.query("insert into public.profiles (id, role, member_status) values ($1, 'platform_admin', 'active')", [ADMIN]);
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'lerato@example.co.za', $2)",
    [ADVISOR, { full_name: "Lerato", brokerage_name: "Lerato Ndlovu", workspace_type: "individual" }]);
  org = (await one<{ organisation_id: string }>("select organisation_id from public.profiles where id = $1", [ADVISOR])).organisation_id;
  await asUser(db, ADMIN);
  await db.query("select public.review_broker_organisation($1, 'approve')", [org]);
  await db.query("insert into auth.users (id, email) values ($1, 'colleague@example.co.za')", [COLLEAGUE]);
  await db.query("insert into public.profiles (id, organisation_id, role, member_status) values ($1, $2, 'broker_agent', 'active')", [COLLEAGUE, org]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("claiming and reviewing", () => {
  it("starts with nothing authorised", async () => {
    expect(await authorisedProducts()).toEqual([]);
  });

  it("only accepts evidence the category lists", async () => {
    await asUser(db, ADVISOR);
    await expect(submit("medical_schemes", "fsp_licence")).rejects.toThrow("That evidence is not accepted for this category");
    await expect(submit("long_term_insurance", "fsp_licence", " ")).rejects.toThrow("A reference number is required");
    await expect(submit("long_term_insurance", "fsp_licence", "FSP 1", "2020-01-01")).rejects.toThrow("The expiry date has already passed");
  });

  it("authorises the organisation once a claim is verified, not before", async () => {
    await asUser(db, ADVISOR);
    const id = await submit("long_term_insurance", "representative_appointment");
    await expect(submit("long_term_insurance", "fsp_licence")).rejects.toThrow("already have a pending or verified");
    expect(await authorisedProducts()).toEqual([]);

    await asUser(db, ADVISOR);
    await expect(review(id, "verify")).rejects.toThrow("Only a platform administrator");
    await asUser(db, ADMIN);
    await review(id, "verify");
    expect(await authorisedProducts()).toEqual(["funeral_cover", "life_insurance"]);
  });

  it("needs a reason to reject or revoke", async () => {
    await asUser(db, COLLEAGUE);
    const id = await submit("short_term_insurance", "fsp_licence", "FSP 777");
    await asUser(db, ADMIN);
    await expect(review(id, "reject")).rejects.toThrow("Give a reason the holder will see");
    await review(id, "reject", "Licence number not on the FSCA register");
    const row = await one<{ status: string; review_note: string }>("select status, review_note from public.practitioner_authorisations where id = $1", [id]);
    expect(row).toEqual({ status: "rejected", review_note: "Licence number not on the FSCA register" });
  });

  it("ignores expired authorisations and suspended members", async () => {
    await asUser(db, COLLEAGUE);
    const id = await submit("short_term_insurance", "fsp_licence", "FSP 888");
    await asUser(db, ADMIN);
    await review(id, "verify");
    expect(await authorisedProducts()).toContain("motor_insurance");

    await db.query("update public.practitioner_authorisations set expires_on = current_date - 1 where id = $1", [id]);
    expect(await authorisedProducts()).not.toContain("motor_insurance");
    await db.query("update public.practitioner_authorisations set expires_on = null where id = $1", [id]);

    await db.query("update public.profiles set member_status = 'suspended' where id = $1", [COLLEAGUE]);
    expect(await authorisedProducts()).not.toContain("motor_insurance");
    await db.query("update public.profiles set member_status = 'active' where id = $1", [COLLEAGUE]);
    expect(await authorisedProducts()).toContain("motor_insurance");
  });

  it("lets the holder withdraw, and an admin revoke", async () => {
    await asUser(db, COLLEAGUE);
    const [{ id }] = (await db.query<{ id: string }>(
      "select id from public.practitioner_authorisations where profile_id = $1 and status = 'verified'", [COLLEAGUE])).rows;
    await asUser(db, ADVISOR);
    await expect(db.query("select public.withdraw_authorisation($1)", [id])).rejects.toThrow("Authorisation not found");
    await asUser(db, ADMIN);
    await review(id, "revoke", "Representative appointment ended");
    expect(await authorisedProducts()).not.toContain("motor_insurance");
  });
});

describe("enforcement", () => {
  it("keeps appetite within authorised categories", async () => {
    await asUser(db, ADMIN);
    const appetite = (products: string[]) =>
      db.query("select public.update_buyer_preferences($1, $2, array['Gauteng'], 0, 10, true, false)", [org, products]);
    await expect(appetite(["life_insurance"])).resolves.toBeDefined();
    await expect(appetite(["life_insurance", "motor_insurance"])).rejects.toThrow("not authorised for one or more of these products");
  });

  it("refuses an allocation the broker is not authorised for", async () => {
    const lead = async (products: string[]) => (await one<{ id: string }>(
      `insert into public.leads (business_name, industry, province, city, contact_full_name, contact_email, contact_mobile, insurance_products)
       values ('Test', 'Retail', 'Gauteng', 'Johannesburg', 'Applicant', 'a@example.co.za', '0820000000', $1) returning id`, [products])).id;
    const motorLead = await lead(["motor_insurance"]);
    const lifeLead = await lead(["life_insurance", "motor_insurance"]);
    await expect(db.query("insert into public.lead_allocations (lead_id, buyer_organisation_id, price_cents) values ($1, $2, 0)", [motorLead, org]))
      .rejects.toThrow("Broker is not authorised for the lead's products");
    await expect(db.query("insert into public.lead_allocations (lead_id, buyer_organisation_id, price_cents) values ($1, $2, 0)", [lifeLead, org]))
      .resolves.toBeDefined();
  });

  it("explains the missing authorisation in match evaluations", async () => {
    const motorLead = (await one<{ id: string }>("select id from public.leads where insurance_products = array['motor_insurance']")).id;
    await asUser(db, ADMIN);
    const result = await one<{ result: { matched: boolean; reasons: string[] } }>(
      "select public.evaluate_lead_buyer_match($1, $2) as result", [motorLead, org]);
    expect(result.result.matched).toBe(false);
    expect(result.result.reasons).toContain("Broker is not authorised for the lead's products");
  });

  it("blocks creating or starting campaigns for unauthorised products, never stopping them", async () => {
    const insert = (products: string[]) => db.query(
      `insert into public.campaigns (organisation_id, name, objective, insurance_products, created_by_label)
       values ($1, 'Test campaign', 'awareness', $2, 'test') returning id`, [org, products]);
    await expect(insert(["motor_insurance"])).rejects.toThrow("not authorised for one or more of this campaign's products");
    const campaign = (await insert(["life_insurance"])).rows[0] as { id: string };

    await db.query("update public.campaigns set status = 'approved' where id = $1", [campaign.id]);
    // Authorisation lapses after approval: starting is blocked, stopping is not.
    await db.query("update public.practitioner_authorisations set status = 'revoked' where organisation_id = $1 and category_id = 'long_term_insurance'", [org]);
    await expect(db.query("update public.campaigns set status = 'sending' where id = $1", [campaign.id]))
      .rejects.toThrow("not authorised");
    await expect(db.query("update public.campaigns set status = 'cancelled' where id = $1", [campaign.id])).resolves.toBeDefined();
  });
});

describe("placeholders", () => {
  it("seeds evidence guidance and the representative disclosure, marked as placeholders", async () => {
    const categories = (await db.query<{ id: string; accepted_evidence: string[]; guidance_is_placeholder: boolean }>(
      "select id, accepted_evidence, guidance_is_placeholder from public.product_categories order by display_order")).rows;
    expect(categories.every((category) => category.guidance_is_placeholder && category.accepted_evidence.length > 0)).toBe(true);
    const disclosure = await one<{ content: string }>("select content from public.legal_text_documents where document_key = 'representative_disclosure'");
    expect(disclosure.content).toMatch(/^PLACEHOLDER/);
    expect(disclosure.content).toContain("{{fsp_number}}");
  });
});
