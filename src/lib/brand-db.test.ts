// Database behaviour for brand settings (migration 202610260001), run
// against every migration in an in-memory Postgres.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase } from "./testing/supabase-db";

let db: PGlite;
const ADMIN = "00000000-0000-0000-0000-00000000a001";
const OWNER = "00000000-0000-0000-0000-00000000b001";
const AGENT = "00000000-0000-0000-0000-00000000b002";
let org = "";
const update = (mode: string, name: string | null, capacity: string | null, fspName: string | null, fspNumber: string | null) =>
  db.query("select public.update_brand_settings($1, $2, $3, $4, $5, $6)", [org, mode, name, capacity, fspName, fspNumber]);

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.co.za')", [ADMIN]);
  await db.query("insert into public.profiles (id, role, member_status) values ($1, 'platform_admin', 'active')", [ADMIN]);
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'lerato@example.co.za', $2)",
    [OWNER, { brokerage_name: "Lerato Ndlovu", workspace_type: "individual" }]);
  org = (await db.query<{ organisation_id: string }>("select organisation_id from public.profiles where id = $1", [OWNER])).rows[0].organisation_id;
  await asUser(db, ADMIN);
  await db.query("select public.review_broker_organisation($1, 'approve')", [org]);
  await db.query("insert into auth.users (id, email) values ($1, 'agent@example.co.za')", [AGENT]);
  await db.query("insert into public.profiles (id, organisation_id, role, member_status) values ($1, $2, 'broker_agent', 'active')", [AGENT, org]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("update_brand_settings", () => {
  it("starts every organisation on its company brand", async () => {
    const row = (await db.query<{ brand_mode: string }>("select brand_mode from public.organisations where id = $1", [org])).rows[0];
    expect(row.brand_mode).toBe("company");
  });

  it("needs all four details for a personal brand", async () => {
    await asUser(db, OWNER);
    await expect(update("personal", "Lerato Ndlovu", "representative", "Example Life FSP", null))
      .rejects.toThrow("A personal brand needs your name, capacity, FSP name and FSP number");
    await expect(update("personal", "Lerato", "director", "Example Life FSP", "12345")).rejects.toThrow("Capacity must be");
    await update("personal", " Lerato Ndlovu ", "representative", "Example Life FSP", "12345");
    const row = (await db.query<Record<string, string>>(
      "select brand_mode, disclosure_name, disclosure_capacity, disclosure_fsp_name, disclosure_fsp_number from public.organisations where id = $1", [org])).rows[0];
    expect(row).toEqual({
      brand_mode: "personal", disclosure_name: "Lerato Ndlovu", disclosure_capacity: "representative",
      disclosure_fsp_name: "Example Life FSP", disclosure_fsp_number: "12345",
    });
  });

  it("is limited to the organisation's broker admin and platform admins, with an audit entry", async () => {
    await asUser(db, AGENT);
    await expect(update("company", null, null, null, null)).rejects.toThrow("Only a platform administrator or the organisation's broker admin");
    await asUser(db, ADMIN);
    await update("company", "Lerato Ndlovu", "representative", "Example Life FSP", "12345");
    const audit = await db.query("select 1 from public.audit_logs where entity_id = $1 and action = 'brand_settings_updated'", [org]);
    expect(audit.rows.length).toBe(2);
  });
});
