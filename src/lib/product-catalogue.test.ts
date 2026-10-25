// The product catalogue lives in the database (migrations) and, as a
// fallback, in src/lib/products.ts. These tests load the real migrations
// into an in-memory Postgres (PGlite) and check that:
//   - the built-in fallback matches what the database is seeded with, and
//   - the database refuses hidden, retired and unknown products for broker
//     appetite, and keeps the old `active` flag in step with `status`.
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapCatalogueRows } from "./product-catalogue";
import { FALLBACK_CATALOGUE } from "./products";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const read = (name: string) => fs.readFileSync(path.join(MIGRATIONS, name), "utf8");

// Stand-ins for the parts of earlier migrations these two depend on.
const PRELUDE = `
  create role anon; create role authenticated;
  create schema if not exists auth;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
  create function public.is_platform_admin() returns boolean language sql as $$ select false $$;
  create table public.profiles (id uuid primary key, role text, member_status text, organisation_id uuid);
  create table public.organisations (id uuid primary key, name text, organisation_type text);
  create table public.buyer_preferences (organisation_id uuid primary key, insurance_products text[], provinces text[],
    minimum_score int, daily_lead_capacity int, accepts_campaigns boolean, accepts_shared_leads boolean,
    campaign_daily_send_limit int, campaign_monthly_send_limit int, updated_at timestamptz);
  create table public.audit_logs (actor_id uuid, entity_type text, entity_id uuid, action text, actor_label text, details jsonb);
`;

// Only the product table section of the multi-product migration (the
// rest touches lead tables these tests do not need).
function productFoundationSection() {
  const sql = read("202609090001_multi_product_foundation.sql");
  const end = "grant insert, update, delete on public.insurance_products to authenticated;";
  return sql.slice(0, sql.indexOf(end) + end.length);
}

const ADMIN = "00000000-0000-0000-0000-000000000001";
const BROKER_ORG = "00000000-0000-0000-0000-0000000000aa";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(productFoundationSection());
  const catalogueMigration = read("202610250001_product_catalogue.sql");
  await db.exec(catalogueMigration);
  await db.exec(catalogueMigration); // re-running must be harmless
  await db.exec(`
    insert into public.profiles values ('${ADMIN}', 'platform_admin', 'active', null);
    insert into public.organisations values ('${BROKER_ORG}', 'Test Broker', 'broker');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function seededCatalogue() {
  const categories = await db.query("select id, name, description, required_authorisation, status, display_order from public.product_categories");
  const products = await db.query("select id, name, description, applicant_types, category_id, status, display_order from public.insurance_products");
  return mapCatalogueRows(categories.rows as never[], products.rows as never[]);
}

const byId = <T extends { id?: string; value?: string }>(items: T[]) =>
  [...items].sort((a, b) => String(a.id ?? a.value).localeCompare(String(b.id ?? b.value)));

describe("product catalogue migration", () => {
  it("seeds exactly what the built-in fallback lists", async () => {
    const seeded = await seededCatalogue();
    expect(byId(seeded.categories)).toEqual(byId(FALLBACK_CATALOGUE.categories));
    expect(byId(seeded.products)).toEqual(byId(FALLBACK_CATALOGUE.products));
  });

  it("keeps the old active flag generated from status", async () => {
    await db.exec("update public.insurance_products set status = 'hidden' where id = 'travel_insurance'");
    const hidden = await db.query<{ active: boolean }>("select active from public.insurance_products where id = 'travel_insurance'");
    expect(hidden.rows[0].active).toBe(false);
    await db.exec("update public.insurance_products set status = 'active' where id = 'travel_insurance'");
    const active = await db.query<{ active: boolean }>("select active from public.insurance_products where id = 'travel_insurance'");
    expect(active.rows[0].active).toBe(true);
  });

  it("offers a product only while its category is offered", async () => {
    await expect(db.exec("update public.insurance_products set status = 'active' where id = 'medical_aid'"))
      .rejects.toThrow("Switch the product category on before offering its products");
    await expect(db.exec("update public.product_categories set status = 'hidden' where id = 'long_term_insurance'"))
      .rejects.toThrow("Hide or retire this category's products before switching the category off");

    await db.exec("update public.product_categories set status = 'active' where id = 'medical_schemes'");
    await db.exec("update public.insurance_products set status = 'active' where id = 'medical_aid'");
    await db.exec("update public.insurance_products set status = 'hidden' where id = 'medical_aid'");
    await db.exec("update public.product_categories set status = 'hidden' where id = 'medical_schemes'");
  });

  it("lets broker appetite include only products offered today", async () => {
    await db.exec(`set test.uid = '${ADMIN}'`);
    const appetite = (products: string[]) =>
      db.query("select public.update_buyer_preferences($1, $2, array['Gauteng'], 0, 10, true, false)", [BROKER_ORG, products]);

    await expect(appetite(["business_insurance", "life_insurance"])).resolves.toBeDefined();
    await expect(appetite(["medical_aid"])).rejects.toThrow("Insurance product is not recognised");
    await expect(appetite(["pet_insurance"])).rejects.toThrow("Insurance product is not recognised");

    await db.exec("update public.insurance_products set status = 'retired' where id = 'funeral_cover'");
    await expect(appetite(["funeral_cover"])).rejects.toThrow("Insurance product is not recognised");
  });
});
