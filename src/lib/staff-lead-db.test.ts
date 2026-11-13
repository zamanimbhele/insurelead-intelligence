// Database behaviour for staff-added leads (migration
// 202611130001_staff_added_leads.sql), run against every migration in an
// in-memory Postgres. Calls are made as the real `authenticated` and `anon`
// roles, so grants and row-level security apply as they do in production.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asClient, asOwner, asService, asUser, createMigratedDatabase } from "./testing/supabase-db";

let db: PGlite;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const A_ADMIN = id(11);
const A_AGENT = id(12);
const A_CAMPAIGNS = id(13);
const A_SUSPENDED = id(14);
const B_ADMIN = id(21);
const UNAUTHORISED_ADMIN = id(31);
const PENDING_ADMIN = id(41);
const PENDING_AGENT = id(42);
const org: Record<string, string> = {};

type Result = { status: "created" | "duplicate"; leadId: string };

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

function payload(overrides: { lead?: Record<string, unknown>; consent?: Record<string, unknown>; allowDuplicate?: boolean } = {}) {
  return {
    lead: {
      applicantType: "individual",
      insuranceProducts: ["life_insurance"],
      province: "Gauteng",
      city: "Johannesburg",
      contactFullName: "Test Person",
      contactEmail: "",
      contactMobile: "082 555 0100",
      preferredContactChannel: "phone",
      mainConcern: "Wants cover before a new baby arrives",
      score: 55,
      scoreBand: "warm",
      scoreExplanation: "Test",
      ...overrides.lead,
    },
    consent: { contactBasis: "direct_enquiry", contactPermissionConfirmed: true, ...overrides.consent },
    allowDuplicate: overrides.allowDuplicate ?? false,
  };
}

async function add(user: string, body = payload()): Promise<Result> {
  await asClient(db, "authenticated", user, "member@example.co.za");
  try {
    return (await one<{ result: Result }>("select public.add_staff_lead($1::jsonb) as result", [JSON.stringify(body)])).result;
  } finally {
    await asOwner(db);
  }
}

async function visibleLeadIds(user: string): Promise<string[]> {
  await asClient(db, "authenticated", user);
  try {
    return (await db.query<{ id: string }>("select id from public.leads")).rows.map((row) => row.id);
  } finally {
    await asOwner(db);
  }
}

async function seedOrganisation(key: string, admin: string, options: { approve: boolean; authorise: boolean }) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [admin, `admin-${key}@example.co.za`, { brokerage_name: `Practice ${key}`, full_name: `Admin ${key}` }]);
  org[key] = (await one<{ organisation_id: string }>("select organisation_id from public.profiles where id = $1", [admin])).organisation_id;
  if (options.approve) {
    await asUser(db, ADMIN);
    await db.query("select public.review_broker_organisation($1, 'approve')", [org[key]]);
    await asOwner(db);
  }
  if (options.authorise) {
    await db.query(`
      insert into public.practitioner_authorisations (profile_id, organisation_id, category_id, evidence_type, reference_number, status)
      select $1, $2, category.id, category.accepted_evidence[1], 'TEST', 'verified' from public.product_categories category`, [admin, org[key]]);
  }
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@example.co.za')", [ADMIN]);
  await db.query("insert into public.profiles (id, role, member_status) values ($1, 'platform_admin', 'active')", [ADMIN]);
  await seedOrganisation("a", A_ADMIN, { approve: true, authorise: true });
  await seedOrganisation("b", B_ADMIN, { approve: true, authorise: true });
  await seedOrganisation("unauthorised", UNAUTHORISED_ADMIN, { approve: true, authorise: false });
  await seedOrganisation("pending", PENDING_ADMIN, { approve: false, authorise: true });
  for (const [profile, role, status] of [
    [A_AGENT, "broker_agent", "active"], [A_CAMPAIGNS, "campaign_manager", "active"], [A_SUSPENDED, "broker_agent", "suspended"],
  ]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [profile, `${profile}@example.co.za`]);
    await db.query("insert into public.profiles (id, organisation_id, role, member_status) values ($1, $2, $3, $4)", [profile, org.a, role, status]);
  }
}, 180_000);

afterAll(async () => { await db?.close(); });

describe("adding a lead", () => {
  let leadId = "";

  it("creates a lead that is private to the caller's own organisation", async () => {
    const result = await add(A_ADMIN, payload({ lead: { organisationId: org.b, added_by_organisation_id: org.b } }));
    expect(result.status).toBe("created");
    leadId = result.leadId;

    const lead = await one<Record<string, unknown>>(
      "select origin, added_by_organisation_id, added_by, status, score, score_band, contact_email, utm from public.leads where id = $1", [leadId]);
    expect(lead).toMatchObject({
      origin: "staff_added", added_by_organisation_id: org.a, added_by: A_ADMIN, status: "new", score: 55, score_band: "warm", contact_email: "",
    });

    expect(await visibleLeadIds(A_ADMIN)).toContain(leadId);
    expect(await visibleLeadIds(A_AGENT)).toContain(leadId);
    expect(await visibleLeadIds(B_ADMIN)).not.toContain(leadId);
  });

  it("records contact permission only, an exclusive accepted allocation, and an audit entry without personal details", async () => {
    const consent = await one<Record<string, unknown>>(`
      select contact_consent, marketing_consent, partner_sharing_consent, privacy_notice_accepted, wording_version, contact_basis, recorded_by
      from public.lead_consents where lead_id = $1`, [leadId]);
    expect(consent).toEqual({
      contact_consent: true, marketing_consent: false, partner_sharing_consent: false, privacy_notice_accepted: false,
      wording_version: "staff_recorded_v1", contact_basis: "direct_enquiry", recorded_by: A_ADMIN,
    });
    const allocation = await one<Record<string, unknown>>(
      "select buyer_organisation_id, status, price_cents, exclusive from public.lead_allocations where lead_id = $1", [leadId]);
    expect(allocation).toEqual({ buyer_organisation_id: org.a, status: "accepted", price_cents: 0, exclusive: true });

    const audit = await one<{ action: string; actor_id: string; details: string }>(
      "select action, actor_id, details::text as details from public.audit_logs where entity_id = $1", [leadId]);
    expect(audit.action).toBe("lead_added_by_staff");
    expect(audit.actor_id).toBe(A_ADMIN);
    expect(audit.details).not.toMatch(/Test Person|082/);
  });

  it("cannot be offered to another broker, by the platform or the server", async () => {
    await db.query(`insert into public.buyer_preferences (organisation_id, insurance_products) values ($1, array['life_insurance'])
      on conflict (organisation_id) do update set insurance_products = excluded.insurance_products`, [org.b]);
    await asUser(db, ADMIN);
    await expect(db.query("select public.reserve_lead_for_buyer($1, $2, 1000, false)", [leadId, org.b]))
      .rejects.toThrow("Partner-sharing consent is not recorded");
    await asService(db);
    await expect(db.query("select public.reserve_lead_for_buyer($1, $2, 1000, false)", [leadId, org.b]))
      .rejects.toThrow("Partner-sharing consent is not recorded");
    await asOwner(db);
  });

  it("lets an agent add a lead and work it like any allocated lead", async () => {
    const result = await add(A_AGENT, payload({ lead: { contactMobile: "", contactEmail: "Agent.Lead@Example.co.za", preferredContactChannel: "email" } }));
    expect(result.status).toBe("created");
    expect((await one<{ contact_email: string }>("select contact_email from public.leads where id = $1", [result.leadId])).contact_email)
      .toBe("agent.lead@example.co.za");
    await asClient(db, "authenticated", A_AGENT, "agent@example.co.za");
    await db.query("select public.create_lead_task($1, 'Call back in three months', now() + interval '90 days', null)", [result.leadId]);
    await asOwner(db);
  });
});

describe("who may not add a lead", () => {
  it("refuses anonymous callers, other roles, suspended members and unapproved organisations", async () => {
    await asClient(db, "anon");
    await expect(db.query("select public.add_staff_lead($1::jsonb)", [JSON.stringify(payload())])).rejects.toThrow(/permission denied/);
    await asOwner(db);

    await expect(add(A_CAMPAIGNS)).rejects.toThrow("Only a broker administrator or agent may add a lead");
    await expect(add(A_SUSPENDED)).rejects.toThrow("Only an active workspace member may add a lead");
    await expect(add(ADMIN)).rejects.toThrow("Only a broker administrator or agent may add a lead");
    // The founder of an organisation that is still under review is not active yet.
    await expect(add(PENDING_ADMIN)).rejects.toThrow("Only an active workspace member may add a lead");
    // Even an active member cannot add leads until the organisation is approved.
    await db.query("insert into auth.users (id, email) values ($1, 'pending-agent@example.co.za')", [PENDING_AGENT]);
    await db.query("insert into public.profiles (id, organisation_id, role, member_status) values ($1, $2, 'broker_agent', 'active')", [PENDING_AGENT, org.pending]);
    await expect(add(PENDING_AGENT)).rejects.toThrow("Your organisation is not approved to add leads");
  });

  it("refuses products the organisation is not authorised for", async () => {
    await expect(add(UNAUTHORISED_ADMIN)).rejects.toThrow("not authorised for one or more of these products");
  });

  it("gives signed-in users no direct write access to leads, consents or allocations", async () => {
    await asClient(db, "authenticated", A_ADMIN);
    for (const statement of [
      "insert into public.leads (province, city, contact_full_name, contact_email, contact_mobile) values ('Gauteng', 'Pretoria', 'Direct Insert', 'direct@example.co.za', '0820000009')",
      `insert into public.lead_allocations (lead_id, buyer_organisation_id, price_cents, status) select id, '${org.a}', 0, 'accepted' from public.leads limit 1`,
      "update public.lead_consents set marketing_consent = true, partner_sharing_consent = true",
      "update public.leads set origin = 'public_form'",
    ]) {
      let changed = 0;
      try {
        changed = (await db.query(statement)).affectedRows ?? 0;
      } catch (error) {
        expect(String(error)).toMatch(/permission denied|row-level security/i);
      }
      expect(changed).toBe(0);
    }
    await asOwner(db);
  });
});

describe("what a lead must contain", () => {
  it("needs a statement of how the person agreed to be contacted", async () => {
    await expect(add(A_ADMIN, payload({ consent: { contactPermissionConfirmed: false } })))
      .rejects.toThrow("Confirm that this person agreed to be contacted");
    await expect(add(A_ADMIN, payload({ consent: { contactBasis: "bought_list" } })))
      .rejects.toThrow("Say how this person agreed to be contacted");
    await expect(add(A_ADMIN, payload({ consent: { contactBasis: "other" } })))
      .rejects.toThrow("Describe how this person agreed to be contacted");
  });

  it("needs a way to reach the person and valid details", async () => {
    await expect(add(A_ADMIN, payload({ lead: { contactMobile: "" } }))).rejects.toThrow("An email address or a mobile number is required");
    await expect(add(A_ADMIN, payload({ lead: { contactEmail: "not-an-email" } }))).rejects.toThrow("Email address is not valid");
    await expect(add(A_ADMIN, payload({ lead: { contactMobile: "12345" } }))).rejects.toThrow("Mobile number is not valid");
    await expect(add(A_ADMIN, payload({ lead: { contactFullName: " " } }))).rejects.toThrow("Contact name is required");
    await expect(add(A_ADMIN, payload({ lead: { insuranceProducts: [] } }))).rejects.toThrow("At least one insurance product is required");
    await expect(add(A_ADMIN, payload({ lead: { applicantType: "business", insuranceProducts: ["business_insurance"] } })))
      .rejects.toThrow("Business name is required for a business lead");
    await expect(add(A_ADMIN, payload({ lead: { insuranceProducts: ["business_insurance"] } })))
      .rejects.toThrow("An insurance product does not match the applicant type");
  });
});

describe("duplicates and limits", () => {
  it("points to the existing lead when the mobile number or email is already in the workspace", async () => {
    const first = await add(B_ADMIN, payload({ lead: { contactMobile: "083 111 2222", contactEmail: "dup@example.co.za" } }));
    expect(first.status).toBe("created");

    const sameMobile = await add(B_ADMIN, payload({ lead: { contactMobile: "+27 83 111 2222" } }));
    expect(sameMobile).toEqual({ status: "duplicate", leadId: first.leadId });
    const sameEmail = await add(B_ADMIN, payload({ lead: { contactMobile: "", contactEmail: "DUP@example.co.za" } }));
    expect(sameEmail).toEqual({ status: "duplicate", leadId: first.leadId });

    const anyway = await add(B_ADMIN, payload({ lead: { contactMobile: "083 111 2222" }, allowDuplicate: true }));
    expect(anyway.status).toBe("created");
    expect(anyway.leadId).not.toBe(first.leadId);
  });

  it("does not reveal another organisation's lead as a duplicate", async () => {
    const result = await add(A_ADMIN, payload({ lead: { contactMobile: "083 111 2222" } }));
    expect(result.status).toBe("created");
  });

  it("stops at 200 leads in 24 hours for one organisation", async () => {
    await db.query(`
      insert into public.leads (province, city, contact_full_name, contact_email, contact_mobile, origin, added_by_organisation_id)
      select 'Gauteng', 'Pretoria', 'Filler ' || n, '', '', 'staff_added', $1 from generate_series(1, 200) n`, [org.b]);
    await expect(add(B_ADMIN, payload({ lead: { contactMobile: "084 999 0000" } })))
      .rejects.toThrow("Daily limit for adding leads has been reached");
    // Another organisation is unaffected.
    expect((await add(A_ADMIN, payload({ lead: { contactMobile: "084 999 0000" } }))).status).toBe("created");
  });
});
