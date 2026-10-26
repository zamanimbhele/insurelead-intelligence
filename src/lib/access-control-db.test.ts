// Access control, tested the way an attacker would try it: through the
// same database roles the Supabase Data API uses (anon for the public
// key, authenticated for a signed-in user), so table grants and RLS
// policies are applied exactly as in production. Every migration is
// loaded into an in-memory Postgres with Supabase's default privileges.
//
// Two broker workspaces (A and B) are seeded with one of everything, plus
// a lead nobody has bought and some platform-only records. The tests then
// check, table by table:
//   - anonymous visitors read nothing but the offered product catalogue,
//     and can write nothing;
//   - each broker sees its own rows and none of the other workspace's,
//     the unbought lead's or the platform's;
//   - a broker cannot change or delete another workspace's rows;
//   - a suspended member sees nothing of their workspace;
//   - privileged fields, admin functions and server-only functions are out
//     of reach.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asClient, asOwner, asUser, createMigratedDatabase } from "./testing/supabase-db";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const AUDITOR = id(2);
const A_ADMIN = id(11);
const A_CM = id(12);
const A_AGENT = id(13);
const A_SUSPENDED = id(14);
const B_ADMIN = id(21);
const B_CM = id(22);

// The public tables brokers and visitors must never write to directly.
const OFFERED_CATALOGUE = new Set(["product_categories", "insurance_products"]);

type Workspace = {
  org: string;
  lead: string;
  allocation: string;
  identity: string;
  campaign: string;
  content: string;
  plan: string;
};

let db: PGlite;
let tables: string[] = [];
const ws: Record<"A" | "B", Workspace> = {
  A: { org: "", lead: id(101), allocation: "", identity: "", campaign: "", content: "", plan: "" },
  B: { org: "", lead: id(201), allocation: "", identity: "", campaign: "", content: "", plan: "" },
};
const UNBOUGHT_LEAD = id(301);
const platformOnly: string[] = [];
let platformPlan = "";

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

async function seedWorkspace(key: "A" | "B", admin: string, extra: Array<[string, string, string]>) {
  const w = ws[key];
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [admin, `admin-${key.toLowerCase()}@example.co.za`, { brokerage_name: `Broker ${key}`, full_name: `Admin ${key}` }]);
  w.org = (await one<{ organisation_id: string }>("select organisation_id from public.profiles where id = $1", [admin])).organisation_id;
  await asUser(db, ADMIN);
  await db.query("select public.review_broker_organisation($1, 'approve')", [w.org]);
  await asOwner(db);
  for (const [profile, role, status] of extra) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [profile, `${role}-${key.toLowerCase()}-${status}@example.co.za`]);
    await db.query("insert into public.profiles (id, organisation_id, role, member_status) values ($1, $2, $3, $4)", [profile, w.org, role, status]);
  }
  await db.query(`
    insert into public.practitioner_authorisations (profile_id, organisation_id, category_id, evidence_type, reference_number, status)
    select $1, $2, category.id, category.accepted_evidence[1], 'TEST-${key}', 'verified' from public.product_categories category`, [admin, w.org]);
  await db.query(`
    insert into public.buyer_preferences (organisation_id, insurance_products, accepts_campaigns)
    values ($1, array['business_insurance'], true)
    on conflict (organisation_id) do update set insurance_products = excluded.insurance_products, accepts_campaigns = true`, [w.org]);

  await db.query(`insert into public.leads (id, business_name, province, city, contact_full_name, contact_email, contact_mobile, insurance_products)
    values ($1, $2, 'Gauteng', 'Johannesburg', $3, $4, '0820000000', array['business_insurance'])`,
    [w.lead, `Lead business ${key}`, `Contact ${key}`, `lead-${key.toLowerCase()}@example.co.za`]);
  w.allocation = (await one<{ id: string }>(`insert into public.lead_allocations (lead_id, buyer_organisation_id, price_cents, status)
    values ($1, $2, 1000, 'accepted') returning id`, [w.lead, w.org])).id;
  await db.query("insert into public.lead_notes (lead_id, author_label, body) values ($1, 'seed', 'note')", [w.lead]);
  await db.query("insert into public.lead_tasks (lead_id, title) values ($1, 'call back')", [w.lead]);
  await db.query("insert into public.lead_activities (lead_id, kind, summary, actor_label) values ($1, 'note_added', 'note', 'seed')", [w.lead]);
  await db.query("insert into public.lead_consents (lead_id, contact_consent, partner_sharing_consent, wording_version, source_url) values ($1, true, true, 'v1', 'https://example.co.za')", [w.lead]);
  await db.query("insert into public.lead_outcomes (allocation_id, outcome) values ($1, 'contacted')", [w.allocation]);
  await db.query("insert into public.lead_match_evaluations (lead_id, buyer_organisation_id, matched) values ($1, $2, true)", [w.lead, w.org]);
  w.identity = (await one<{ id: string }>(`insert into public.broker_sending_identities (organisation_id, domain, from_name, from_email, status)
    values ($1, $2, $3, $4, 'verified') returning id`, [w.org, `${key.toLowerCase()}.example.co.za`, `Broker ${key}`, `hello@${key.toLowerCase()}.example.co.za`])).id;
  w.campaign = (await one<{ id: string }>(`insert into public.campaigns (organisation_id, name, objective, insurance_products, created_by_label, sending_identity_id)
    values ($1, $2, 'awareness', array['business_insurance'], 'seed', $3) returning id`, [w.org, `Campaign ${key}`, w.identity])).id;
  w.content = (await one<{ id: string }>(`insert into public.campaign_content_versions (campaign_id, version_number, subject, html_body, text_body, generated_by_label)
    values ($1, 1, 'Hello', '<p>Hi {{unsubscribe_url}}</p>', 'Hi {{unsubscribe_url}}', 'seed') returning id`, [w.campaign])).id;
  await db.query(`insert into public.campaign_approvals (campaign_id, content_version_id, approved_by_label, attestation)
    values ($1, $2, 'seed', 'I approve this campaign for delivery')`, [w.campaign, w.content]);
  await db.query("insert into public.campaign_recipients (campaign_id, lead_id) values ($1, $2)", [w.campaign, w.lead]);
  await db.query("insert into public.campaign_delivery_events (campaign_id, event_type, actor_label) values ($1, 'content_generated', 'seed')", [w.campaign]);
  await db.query("insert into public.marketing_suppressions (organisation_id, email_hash, reason, source_campaign_id) values ($1, $2, 'manual', $3)",
    [w.org, (key === "A" ? "a" : "b").repeat(64), w.campaign]);
  await db.query("insert into public.audit_logs (entity_type, entity_id, action, details) values ('lead', $1, 'seeded', $2)",
    [w.lead, { buyerOrganisationId: w.org }]);
  await db.query("insert into public.task_digest_deliveries (profile_id, digest_date) values ($1, current_date)", [admin]);
  await asUser(db, admin, `admin-${key.toLowerCase()}@example.co.za`);
  w.plan = (await one<{ result: { id: string } }>("select public.create_fye_campaign_plan($1, 'March', 'January', 'private notes') as result", [`Plan ${key}`])).result.id;
  await asOwner(db);
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.co.za'), ($2, 'auditor@example.co.za')", [ADMIN, AUDITOR]);
  await db.query("insert into public.profiles (id, role, member_status) values ($1, 'platform_admin', 'active'), ($2, 'compliance_auditor', 'active')", [ADMIN, AUDITOR]);

  await seedWorkspace("A", A_ADMIN, [[A_CM, "campaign_manager", "active"], [A_AGENT, "broker_agent", "active"], [A_SUSPENDED, "broker_agent", "suspended"]]);
  await seedWorkspace("B", B_ADMIN, [[B_CM, "campaign_manager", "active"]]);

  await db.query(`insert into public.leads (id, business_name, province, city, contact_full_name, contact_email, contact_mobile, insurance_products)
    values ($1, 'Unbought business', 'Gauteng', 'Pretoria', 'Nobody', 'unbought@example.co.za', '0820000001', array['business_insurance'])`, [UNBOUGHT_LEAD]);
  platformOnly.push((await one<{ id: string }>(`insert into public.data_sources (name, source_type, owner, legal_basis, consent_status, approved_use, created_by)
    values ('Platform source', 'website_lead_form', 'InsureLead', 'consent', 'consent_obtained', 'leads', 'seed') returning id`)).id);
  platformOnly.push((await one<{ id: string }>(`insert into public.data_subject_requests (request_type, requester_name, requester_email)
    values ('access', 'Private Person', 'private.person@example.co.za') returning id`)).id);
  platformOnly.push((await one<{ id: string }>("insert into public.opt_out_requests (channel, source, contact_email) values ('email', 'email', 'optout.person@example.co.za') returning id")).id);
  await asUser(db, ADMIN, "admin@example.co.za");
  platformPlan = (await one<{ result: { id: string } }>("select public.create_fye_campaign_plan('Platform plan', 'February', 'December') as result")).result.id;
  await asOwner(db);

  tables = (await db.query<{ relname: string }>(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`)).rows.map((row) => row.relname);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

// Every row of a table the current role can see, as text.
async function visibleRows(table: string): Promise<string[]> {
  return (await db.query<{ row: string }>(`select to_jsonb(t)::text as row from public.${table} t`)).rows.map((r) => r.row);
}

// Rows changed by a statement, or 0 when the role may not run it at all.
async function affected(sql: string, params: unknown[] = []): Promise<number> {
  try {
    return (await db.query(sql, params)).affectedRows ?? 0;
  } catch (error) {
    expect(String(error)).toMatch(/permission denied|row-level security|not permitted|violates/i);
    return 0;
  }
}

const identifiersOf = (w: Workspace) => [w.org, w.lead, w.allocation, w.identity, w.campaign, w.content, w.plan];

describe("database setup", () => {
  it("has row-level security on every public table", async () => {
    const missing = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(missing.rows).toEqual([]);
  });

  it("pins the search_path of every SECURITY DEFINER function", async () => {
    const unpinned = await db.query<{ fn: string }>(`
      select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting where setting like 'search_path=%')`);
    expect(unpinned.rows).toEqual([]);
  });

  it("gives the public key no write, truncate or trigger privilege on any table", async () => {
    const granted = await db.query<{ relname: string; privilege: string }>(`
      select c.relname, privilege from pg_class c join pg_namespace n on n.oid = c.relnamespace,
        unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
      where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, privilege)`);
    expect(granted.rows).toEqual([]);
    const truncate = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'TRUNCATE')`);
    expect(truncate.rows).toEqual([]);
  });

  it("lets anonymous callers run only the read-only helper functions", async () => {
    // Helpers that RLS policies call (they must stay callable by whoever
    // runs the query) and trigger functions (cannot be called directly).
    const allowed = new Set([
      "can_approve_campaigns", "can_manage_campaigns", "current_organisation_id", "current_profile_role",
      "is_broker_operator", "is_compliance_auditor", "is_platform_admin",
    ]);
    const callable = await db.query<{ proname: string; trigger: boolean }>(`
      select p.proname, p.prorettype = 'trigger'::regtype as trigger from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')`);
    expect(callable.rows.filter((row) => !row.trigger && !allowed.has(row.proname)).map((row) => row.proname)).toEqual([]);
  });

  it("keeps server-only functions out of reach of signed-in users", async () => {
    const serverOnly = [
      "capture_public_lead", "check_lead_submission_rate_limit", "claim_campaign_send_lease", "release_campaign_send_lease",
      "campaign_send_usage", "create_platform_sending_identity", "pause_sending_identity", "task_digest_rows",
    ];
    const reachable = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1)
        and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`, [serverOnly]);
    expect(reachable.rows).toEqual([]);
  });
});

describe("anonymous visitors (public key)", () => {
  it("read nothing except the offered product catalogue", async () => {
    await asClient(db, "anon");
    for (const table of tables) {
      let rows: string[] = [];
      try {
        rows = await visibleRows(table);
      } catch (error) {
        expect(String(error)).toMatch(/permission denied/);
      }
      if (OFFERED_CATALOGUE.has(table)) {
        expect(rows.every((row) => JSON.parse(row).status === "active"), table).toBe(true);
      } else {
        expect(rows, table).toEqual([]);
      }
    }
    await asOwner(db);
  });

  it("cannot insert, change or delete anything", async () => {
    for (const table of tables) {
      // A copy of a real row (new id), so only privileges and policies can
      // stop it - not a missing value.
      const row = (await db.query<{ row: Record<string, unknown> }>(`select to_jsonb(t) as row from public.${table} t limit 1`)).rows[0]?.row;
      const columns = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`, [table])).rows.map((r) => r.column_name);
      const list = columns.map((column) => `"${column}"`).join(", ");
      await asClient(db, "anon");
      if (row) {
        const copy = { ...row, ...(typeof row.id === "string" && /^[0-9a-f-]{36}$/.test(row.id) ? { id: id(999) } : {}) };
        await expect(db.query(`insert into public.${table} (${list}) select ${list} from jsonb_populate_record(null::public.${table}, $1)`, [copy]), table)
          .rejects.toThrow(/permission denied|row-level security/);
      }
      expect(await affected(`update public.${table} set "${columns[0]}" = "${columns[0]}"`), table).toBe(0);
      expect(await affected(`delete from public.${table}`), table).toBe(0);
      await asOwner(db);
    }
  });
});

describe.each([
  ["workspace A's broker admin", "A", "B", A_ADMIN],
  ["workspace A's campaign manager", "A", "B", A_CM],
  ["workspace A's broker agent", "A", "B", A_AGENT],
  ["workspace B's broker admin", "B", "A", B_ADMIN],
] as const)("%s", (_label, own, other, user) => {
  it("sees its own records", async () => {
    await asClient(db, "authenticated", user);
    expect((await visibleRows("leads")).some((row) => row.includes(ws[own].lead))).toBe(true);
    expect((await visibleRows("campaigns")).some((row) => row.includes(ws[own].campaign))).toBe(true);
    expect((await visibleRows("financial_year_calendars")).some((row) => row.includes(ws[own].plan))).toBe(true);
    await asOwner(db);
  });

  it("sees nothing of the other workspace, unbought leads or platform records", async () => {
    await asClient(db, "authenticated", user);
    const forbidden = [...identifiersOf(ws[other]), UNBOUGHT_LEAD, ...platformOnly];
    for (const table of tables) {
      let rows: string[] = [];
      try {
        rows = await visibleRows(table);
      } catch (error) {
        expect(String(error)).toMatch(/permission denied/);
      }
      const leaked = rows.filter((row) => forbidden.some((value) => row.includes(value)));
      expect(leaked, table).toEqual([]);
    }
    await asOwner(db);
  });

  it("cannot change or delete the other workspace's rows", async () => {
    const targets = [...identifiersOf(ws[other]), UNBOUGHT_LEAD, ...platformOnly];
    await asClient(db, "authenticated", user);
    for (const table of tables) {
      const hasId = (await db.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'id'`, [table])).rows.length > 0;
      if (!hasId) continue;
      expect(await affected(`update public.${table} set id = id where id::text = any($1)`, [targets]), `update ${table}`).toBe(0);
      expect(await affected(`delete from public.${table} where id::text = any($1)`, [targets]), `delete ${table}`).toBe(0);
    }
    await asOwner(db);
  });
});

describe("a suspended member", () => {
  it("sees none of the workspace's records", async () => {
    await asClient(db, "authenticated", A_SUSPENDED);
    const workspace = identifiersOf(ws.A).filter((value) => value !== ws.A.org);
    for (const table of tables) {
      let rows: string[] = [];
      try {
        rows = await visibleRows(table);
      } catch {
        rows = [];
      }
      expect(rows.filter((row) => workspace.some((value) => row.includes(value))), table).toEqual([]);
    }
    await asOwner(db);
  });

  it("cannot create a campaign plan", async () => {
    await asClient(db, "authenticated", A_SUSPENDED);
    await expect(db.query("select public.create_fye_campaign_plan('x', 'March', 'January')")).rejects.toThrow(/active platform member|permission denied/);
    await asOwner(db);
  });
});

describe("privileged fields and actions", () => {
  it("a member cannot change their own role or status", async () => {
    await asClient(db, "authenticated", A_AGENT);
    expect(await affected("update public.profiles set role = 'platform_admin', member_status = 'active' where id = $1", [A_AGENT])).toBe(0);
    await asOwner(db);
    expect((await one<{ role: string }>("select role from public.profiles where id = $1", [A_AGENT])).role).toBe("broker_agent");
  });

  it("a broker admin cannot approve or re-type their own organisation", async () => {
    await asClient(db, "authenticated", A_ADMIN);
    expect(await affected("update public.organisations set onboarding_status = 'approved', status = 'active', workspace_type = 'brokerage' where id = $1", [ws.A.org])).toBe(0);
    await expect(db.query("select public.review_broker_organisation($1, 'reject')", [ws.B.org])).rejects.toThrow();
    await expect(db.query("select public.set_workspace_type($1, 'individual')", [ws.B.org])).rejects.toThrow();
    await asOwner(db);
    expect((await one<{ onboarding_status: string }>("select onboarding_status from public.organisations where id = $1", [ws.B.org])).onboarding_status).toBe("approved");
  });

  it("a broker cannot verify its own licence, buy a lead, or record an outcome directly", async () => {
    await asClient(db, "authenticated", A_ADMIN);
    await expect(db.query(`insert into public.practitioner_authorisations (profile_id, organisation_id, category_id, evidence_type, reference_number, status)
      values ($1, $2, 'short_term_insurance', 'fsp_licence', 'FAKE', 'verified')`, [A_ADMIN, ws.A.org])).rejects.toThrow(/permission denied|row-level security/);
    await expect(db.query("insert into public.lead_allocations (lead_id, buyer_organisation_id, price_cents, status) values ($1, $2, 0, 'accepted')",
      [UNBOUGHT_LEAD, ws.A.org])).rejects.toThrow(/permission denied|row-level security/);
    await expect(db.query("insert into public.lead_outcomes (allocation_id, outcome) values ($1, 'won')", [ws.A.allocation]))
      .rejects.toThrow(/permission denied|row-level security/);
    expect(await affected("update public.lead_outcomes set outcome = 'won'")).toBe(0);
    expect(await affected("delete from public.lead_outcomes")).toBe(0);
    await asOwner(db);
  });

  it("a campaign manager cannot approve, re-target or move a campaign", async () => {
    await asClient(db, "authenticated", A_CM);
    expect(await affected("update public.campaigns set status = 'approved', approved_content_version = 1 where id = $1", [ws.A.campaign])).toBe(0);
    await expect(db.query(`insert into public.campaign_approvals (campaign_id, content_version_id, approved_by_label, attestation)
      values ($1, $2, 'me', 'I approve this campaign for delivery')`, [ws.A.campaign, ws.A.content])).rejects.toThrow(/permission denied|row-level security/);
    const insert = (org: string, identity: string, status = "draft") => db.query(`insert into public.campaigns (organisation_id, name, objective, insurance_products, created_by_label, sending_identity_id, status)
      values ($1, 'Sneaky campaign', 'awareness', array['business_insurance'], 'me', $2, $3)`, [org, identity, status]);
    await expect(insert(ws.B.org, ws.B.identity)).rejects.toThrow(/row-level security/);
    await expect(insert(ws.A.org, ws.B.identity)).rejects.toThrow(/row-level security/);
    await expect(insert(ws.A.org, ws.A.identity, "approved")).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into public.marketing_suppressions (organisation_id, email_hash, reason) values ($1, $2, 'manual')", [ws.B.org, "c".repeat(64)]))
      .rejects.toThrow(/row-level security/);
    await asOwner(db);
  });
});

describe("audit log", () => {
  it("platform admins add entries in their own name only; brokers cannot add any", async () => {
    await asClient(db, "authenticated", ADMIN);
    await db.query("insert into public.audit_logs (entity_type, entity_id, action, actor_label) values ('settings', $1, 'retention_changed', 'Admin')", [id(900)]);
    await expect(db.query("insert into public.audit_logs (actor_id, entity_type, entity_id, action) values ($1, 'settings', $2, 'forged')", [A_ADMIN, id(901)]))
      .rejects.toThrow(/row-level security/);
    expect(await affected("update public.audit_logs set action = 'edited'")).toBe(0);
    expect(await affected("delete from public.audit_logs")).toBe(0);
    await asClient(db, "authenticated", A_ADMIN);
    await expect(db.query("insert into public.audit_logs (entity_type, entity_id, action) values ('lead', $1, 'forged')", [id(902)]))
      .rejects.toThrow(/row-level security/);
    await asOwner(db);
    expect((await one<{ actor_id: string }>("select actor_id from public.audit_logs where action = 'retention_changed'")).actor_id).toBe(ADMIN);
  });
});

describe("FYE campaign plans", () => {
  it("are visible to their own workspace and platform staff, and platform plans to everyone", async () => {
    await asClient(db, "authenticated", B_CM);
    const seen = (await visibleRows("financial_year_calendars")).join("\n");
    expect(seen).toContain(ws.B.plan);
    expect(seen).toContain(platformPlan);
    expect(seen).not.toContain(ws.A.plan);
    for (const staff of [ADMIN, AUDITOR]) {
      await asClient(db, "authenticated", staff);
      const all = (await visibleRows("financial_year_calendars")).join("\n");
      expect(all).toContain(ws.A.plan);
      expect(all).toContain(ws.B.plan);
    }
    await asOwner(db);
  });

  it("can be re-statused only by their own workspace (platform plans only by staff)", async () => {
    await asClient(db, "authenticated", B_ADMIN);
    await expect(db.query("select public.update_fye_campaign_plan_status($1, 'cancelled')", [ws.A.plan])).rejects.toThrow("Campaign plan not found");
    await expect(db.query("select public.update_fye_campaign_plan_status($1, 'cancelled')", [platformPlan])).rejects.toThrow("Campaign plan not found");
    await db.query("select public.update_fye_campaign_plan_status($1, 'active')", [ws.B.plan]);
    await asClient(db, "authenticated", ADMIN);
    await db.query("select public.update_fye_campaign_plan_status($1, 'active')", [ws.A.plan]);
    await asOwner(db);
    const statuses = await db.query<{ id: string; status: string }>("select id, status from public.financial_year_calendars where id = any($1)", [[ws.A.plan, platformPlan]]);
    expect(Object.fromEntries(statuses.rows.map((row) => [row.id, row.status]))).toEqual({ [ws.A.plan]: "active", [platformPlan]: "planned" });
  });
});

describe("the hardening migration", () => {
  it("is safe to re-run, and assigns older plans to the workspace of the broker who created them", async () => {
    const legacy = (await one<{ id: string }>(`insert into public.financial_year_calendars (title, fye_month, planned_contact_month, created_by)
      values ('Legacy plan', 'June', 'April', 'admin-a@example.co.za') returning id`)).id;
    await db.query(`insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label)
      values ($1, 'fye_campaign_plan', $2, 'fye_campaign_plan_created', 'admin-a@example.co.za')`, [A_ADMIN, legacy]);
    const untraced = (await one<{ id: string }>(`insert into public.financial_year_calendars (title, fye_month, planned_contact_month, created_by)
      values ('Untraced plan', 'June', 'April', 'someone') returning id`)).id;

    const fs = await import("node:fs");
    const path = await import("node:path");
    await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "202610270001_security_hardening.sql"), "utf8"));

    const orgs = await db.query<{ id: string; organisation_id: string | null }>(
      "select id, organisation_id from public.financial_year_calendars where id = any($1)", [[legacy, untraced, ws.B.plan]]);
    expect(Object.fromEntries(orgs.rows.map((row) => [row.id, row.organisation_id]))).toEqual({
      [legacy]: ws.A.org,
      [untraced]: null,
      [ws.B.plan]: ws.B.org,
    });
  });
});
