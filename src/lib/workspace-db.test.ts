// Database behaviour for individual workspaces (migration
// 202610250002_individual_workspaces.sql), run against every migration in
// an in-memory Postgres.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase } from "./testing/supabase-db";

let db: PGlite;
const ADMIN = "00000000-0000-0000-0000-00000000a001";

async function signUp(id: string, meta: Record<string, string>) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, `${id.slice(-4)}@example.co.za`, meta]);
  const result = await db.query<{ organisation_id: string; workspace_type: string; member_status: string }>(
    `select p.organisation_id, o.workspace_type, p.member_status
     from public.profiles p join public.organisations o on o.id = p.organisation_id where p.id = $1`, [id]);
  return result.rows[0];
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.co.za')", [ADMIN]);
  await db.query("insert into public.profiles (id, role, member_status, display_name) values ($1, 'platform_admin', 'active', 'Admin')", [ADMIN]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("signup records the workspace type", () => {
  it("creates an individual workspace for a solo advisor", async () => {
    const solo = await signUp("00000000-0000-0000-0000-00000000b001", {
      full_name: "Lerato Ndlovu", brokerage_name: "Lerato Ndlovu", workspace_type: "individual",
    });
    expect(solo.workspace_type).toBe("individual");
    expect(solo.member_status).toBe("invited");
  });

  it("defaults to a brokerage when the type is missing or unknown", async () => {
    expect((await signUp("00000000-0000-0000-0000-00000000b002", { brokerage_name: "Old Form Brokers" })).workspace_type).toBe("brokerage");
    expect((await signUp("00000000-0000-0000-0000-00000000b003", { brokerage_name: "Odd", workspace_type: "galaxy" })).workspace_type).toBe("brokerage");
  });
});

describe("approval activates the person who registered", () => {
  it("activates the founder but not someone invited later", async () => {
    const founder = "00000000-0000-0000-0000-00000000c001";
    const invitee = "00000000-0000-0000-0000-00000000c002";
    const { organisation_id: org } = await signUp(founder, { full_name: "Thabo", brokerage_name: "Thabo Advisory", workspace_type: "individual" });
    await db.query("insert into auth.users (id, email) values ($1, 'invitee@example.co.za')", [invitee]);
    await db.query("insert into public.profiles (id, organisation_id, role, member_status) values ($1, $2, 'broker_agent', 'invited')", [invitee, org]);

    await asUser(db, ADMIN, "admin@example.co.za");
    await db.query("select public.review_broker_organisation($1, 'approve')", [org]);

    const statuses = await db.query<{ id: string; member_status: string }>("select id, member_status from public.profiles where organisation_id = $1", [org]);
    expect(Object.fromEntries(statuses.rows.map((row) => [row.id, row.member_status]))).toEqual({ [founder]: "active", [invitee]: "invited" });
  });

  it("does not activate anyone when the organisation is rejected", async () => {
    const founder = "00000000-0000-0000-0000-00000000c003";
    const { organisation_id: org } = await signUp(founder, { brokerage_name: "Rejected Co" });
    await asUser(db, ADMIN);
    await db.query("select public.review_broker_organisation($1, 'reject')", [org]);
    const result = await db.query<{ member_status: string }>("select member_status from public.profiles where id = $1", [founder]);
    expect(result.rows[0].member_status).toBe("invited");
  });
});

describe("set_workspace_type", () => {
  it("lets the organisation's own broker admin and platform admins change it, with an audit entry", async () => {
    const owner = "00000000-0000-0000-0000-00000000d001";
    const { organisation_id: org } = await signUp(owner, { brokerage_name: "Growing Practice", workspace_type: "individual" });
    await asUser(db, ADMIN);
    await db.query("select public.review_broker_organisation($1, 'approve')", [org]);

    await asUser(db, owner);
    const changed = await db.query<{ result: { changed: boolean } }>("select public.set_workspace_type($1, 'practice') as result", [org]);
    expect(changed.rows[0].result.changed).toBe(true);
    await asUser(db, ADMIN);
    await db.query("select public.set_workspace_type($1, 'brokerage')", [org]);

    const audit = await db.query<{ details: { from: string; to: string } }>(
      "select details from public.audit_logs where entity_id = $1 and action = 'workspace_type_changed' order by created_at", [org]);
    expect(audit.rows.map((row) => `${row.details.from}->${row.details.to}`)).toEqual(["individual->practice", "practice->brokerage"]);
  });

  it("refuses another organisation's broker admin and unknown types", async () => {
    const owner = "00000000-0000-0000-0000-00000000d002";
    const outsider = "00000000-0000-0000-0000-00000000d003";
    const { organisation_id: org } = await signUp(owner, { brokerage_name: "Mine" });
    const { organisation_id: otherOrg } = await signUp(outsider, { brokerage_name: "Theirs" });
    await asUser(db, ADMIN);
    await db.query("select public.review_broker_organisation($1, 'approve')", [org]);
    await db.query("select public.review_broker_organisation($1, 'approve')", [otherOrg]);

    await asUser(db, outsider);
    await expect(db.query("select public.set_workspace_type($1, 'individual')", [org])).rejects.toThrow(/Only a platform administrator/);
    await asUser(db, owner);
    await expect(db.query("select public.set_workspace_type($1, 'galaxy')", [org])).rejects.toThrow(/Workspace type must be/);
  });
});
