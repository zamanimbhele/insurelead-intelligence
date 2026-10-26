// Database behaviour for platform-managed sending (migration
// 202610260002), run against every migration in an in-memory Postgres.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createMigratedDatabase } from "./testing/supabase-db";

let db: PGlite;
const ADMIN = "00000000-0000-0000-0000-00000000a001";
const OWNER = "00000000-0000-0000-0000-00000000b001";
const AGENT = "00000000-0000-0000-0000-00000000b002";
let org = "";
const create = (profile: string, domain = "mail.insurelead.example", name = "Lerato Ndlovu") =>
  db.query<{ result: Record<string, string> }>("select public.create_platform_sending_identity($1, $2, $3) as result", [profile, domain, name]);

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.co.za')", [ADMIN]);
  await db.query("insert into public.profiles (id, role, member_status) values ($1, 'platform_admin', 'active')", [ADMIN]);
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'Lerato@Example.co.za', $2)",
    [OWNER, { brokerage_name: "Lerato Ndlovu", workspace_type: "individual" }]);
  org = (await db.query<{ organisation_id: string }>("select organisation_id from public.profiles where id = $1", [OWNER])).rows[0].organisation_id;
  await db.query("insert into auth.users (id, email) values ($1, 'agent@example.co.za')", [AGENT]);
  await db.query("insert into public.profiles (id, organisation_id, role, member_status) values ($1, $2, 'broker_agent', 'active')", [AGENT, org]);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("create_platform_sending_identity", () => {
  it("can only be called by the server", async () => {
    await asUser(db, OWNER);
    await expect(create(OWNER)).rejects.toThrow("created by the server only");
  });

  it("needs an approved organisation and a manager", async () => {
    await asUser(db, ADMIN);
    await db.query("select public.review_broker_organisation($1, 'approve')", [org]);
    await db.query("update public.organisations set onboarding_status = 'in_review' where id = $1", [org]);
    await asService(db);
    await expect(create(OWNER)).rejects.toThrow("must be approved");
    await db.query("update public.organisations set onboarding_status = 'approved' where id = $1", [org]);
    await expect(create(AGENT)).rejects.toThrow("Only a broker manager or campaign manager");
    await expect(create(OWNER, "not a domain")).rejects.toThrow("platform sending domain is not configured");
  });

  it("creates a verified 'via InsureLead' identity replying to the advisor's own email", async () => {
    await asService(db);
    const { result } = (await create(OWNER)).rows[0];
    expect(result.fromName).toBe("Lerato Ndlovu via InsureLead");
    expect(result.fromEmail).toMatch(/^lerato-ndlovu-[0-9a-f]{8}@mail\.insurelead\.example$/);
    expect(result.replyToEmail).toBe("lerato@example.co.za");
    expect(result.status).toBe("verified");
    await expect(create(OWNER)).rejects.toThrow("already has an InsureLead sending identity");
  });
});

describe("pausing and re-enabling", () => {
  it("is paused by the server with a reason, and re-enabled by an admin", async () => {
    const { id } = (await db.query<{ id: string }>("select id from public.broker_sending_identities where organisation_id = $1 and kind = 'platform'", [org])).rows[0];
    await asUser(db, OWNER);
    await expect(db.query("select public.pause_sending_identity($1, 'x')", [id])).rejects.toThrow("paused by the server only");

    await asService(db);
    await db.query("select public.pause_sending_identity($1, 'Complaint rate 2.0% over the last 30 days')", [id]);
    let row = (await db.query<{ status: string; status_reason: string | null }>("select status, status_reason from public.broker_sending_identities where id = $1", [id])).rows[0];
    expect(row).toEqual({ status: "disabled", status_reason: "Complaint rate 2.0% over the last 30 days" });

    await asUser(db, ADMIN);
    await db.query("select public.review_sending_identity($1, 'verified')", [id]);
    row = (await db.query<{ status: string; status_reason: string | null }>("select status, status_reason from public.broker_sending_identities where id = $1", [id])).rows[0];
    expect(row).toEqual({ status: "verified", status_reason: null });
  });
});
