// The product catalogue lives in the database (migrations) and, as a
// fallback, in src/lib/products.ts. These tests apply every migration to
// an in-memory Postgres (PGlite) and check that:
//   - the built-in fallback matches what the database is seeded with,
//   - the catalogue migrations are safe to re-run,
//   - the old `active` flag follows `status`, and a product is only
//     offered while its category is,
//   - broker appetite refuses hidden, retired and unknown products.
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapCatalogueRows } from "./product-catalogue";
import { FALLBACK_CATALOGUE } from "./products";
import { asUser, createMigratedDatabase } from "./testing/supabase-db";

const migration = (name: string) => fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", name), "utf8");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const BROKER = "00000000-0000-0000-0000-000000000002";
let db: PGlite;
let org = "";

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.co.za')", [ADMIN]);
  await db.query("insert into public.profiles (id, role, member_status) values ($1, 'platform_admin', 'active')", [ADMIN]);
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'broker@example.co.za', $2)",
    [BROKER, { brokerage_name: "Test Broker" }]);
  org = (await db.query<{ organisation_id: string }>("select organisation_id from public.profiles where id = $1", [BROKER])).rows[0].organisation_id;
  await asUser(db, ADMIN);
  await db.query("select public.review_broker_organisation($1, 'approve')", [org]);
  // Authorise the broker for every category, so these tests isolate the
  // catalogue rules from the authorisation rules (authorisation-db.test.ts).
  await db.query(`
    insert into public.practitioner_authorisations (profile_id, organisation_id, category_id, evidence_type, reference_number, status)
    select $1, $2, category.id, category.accepted_evidence[1], 'TEST', 'verified' from public.product_categories category`, [BROKER, org]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function seededCatalogue() {
  const categories = await db.query("select id, name, description, required_authorisation, status, display_order, accepted_evidence, evidence_guidance, guidance_is_placeholder from public.product_categories");
  const products = await db.query("select id, name, description, applicant_types, category_id, status, display_order from public.insurance_products");
  return mapCatalogueRows(categories.rows as never[], products.rows as never[]);
}

const byId = <T extends { id?: string; value?: string }>(items: T[]) =>
  [...items].sort((a, b) => String(a.id ?? a.value).localeCompare(String(b.id ?? b.value)));

describe("product catalogue migrations", () => {
  it("seed exactly what the built-in fallback lists", async () => {
    const seeded = await seededCatalogue();
    expect(byId(seeded.categories)).toEqual(byId(FALLBACK_CATALOGUE.categories));
    expect(byId(seeded.products)).toEqual(byId(FALLBACK_CATALOGUE.products));
  });

  it("are safe to run again", async () => {
    await db.exec(migration("202610250001_product_catalogue.sql"));
    await db.exec(migration("202610250003_practitioner_authorisations.sql"));
    const seeded = await seededCatalogue();
    expect(byId(seeded.products)).toEqual(byId(FALLBACK_CATALOGUE.products));
  });

  it("keep the old active flag generated from status", async () => {
    await db.exec("update public.insurance_products set status = 'hidden' where id = 'travel_insurance'");
    const hidden = await db.query<{ active: boolean }>("select active from public.insurance_products where id = 'travel_insurance'");
    expect(hidden.rows[0].active).toBe(false);
    await db.exec("update public.insurance_products set status = 'active' where id = 'travel_insurance'");
    const active = await db.query<{ active: boolean }>("select active from public.insurance_products where id = 'travel_insurance'");
    expect(active.rows[0].active).toBe(true);
  });

  it("offer a product only while its category is offered", async () => {
    await expect(db.exec("update public.insurance_products set status = 'active' where id = 'medical_aid'"))
      .rejects.toThrow("Switch the product category on before offering its products");
    await expect(db.exec("update public.product_categories set status = 'hidden' where id = 'long_term_insurance'"))
      .rejects.toThrow("Hide or retire this category's products before switching the category off");

    await db.exec("update public.product_categories set status = 'active' where id = 'medical_schemes'");
    await db.exec("update public.insurance_products set status = 'active' where id = 'medical_aid'");
    await db.exec("update public.insurance_products set status = 'hidden' where id = 'medical_aid'");
    await db.exec("update public.product_categories set status = 'hidden' where id = 'medical_schemes'");
  });

  it("let broker appetite include only products offered today", async () => {
    await asUser(db, ADMIN);
    const appetite = (products: string[]) =>
      db.query("select public.update_buyer_preferences($1, $2, array['Gauteng'], 0, 10, true, false)", [org, products]);

    await expect(appetite(["business_insurance", "life_insurance"])).resolves.toBeDefined();
    await expect(appetite(["medical_aid"])).rejects.toThrow("Insurance product is not recognised");
    await expect(appetite(["pet_insurance"])).rejects.toThrow("Insurance product is not recognised");

    await db.exec("update public.insurance_products set status = 'retired' where id = 'funeral_cover'");
    await expect(appetite(["funeral_cover"])).rejects.toThrow("Insurance product is not recognised");
    await db.exec("update public.insurance_products set status = 'active' where id = 'funeral_cover'");
  });
});
