// Test helper: an in-memory Postgres (PGlite) with every migration in
// supabase/migrations applied in order, on top of a minimal stand-in for
// the parts of Supabase the migrations rely on (auth schema, roles,
// auth.uid()/auth.jwt()/auth.role()). Lets tests exercise the real
// database functions, policies and triggers.
//
// Acting as a user: `await asUser(db, profileId)` makes auth.uid() return
// that id for the following statements; `asService(db)` sets the
// service_role claim. Both keep running as the table owner, so row-level
// security is NOT applied: use them to set up data and to call SECURITY
// DEFINER functions.
//
// To test what a real client can do, use `asClient(db, "anon")` or
// `asClient(db, "authenticated", profileId)`: these switch to the same
// database role PostgREST uses, so grants and RLS policies apply exactly
// as they would for the public key. `asOwner(db)` switches back.
//
// The stand-in grants anon/authenticated/service_role the same default
// privileges a Supabase project does (everything in public, unless a
// migration revokes it), so a missing revoke shows up here too.
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role authenticator nologin noinherit;
  -- Supabase's default privileges: the API roles may use everything in
  -- public unless a migration says otherwise.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema if not exists auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated')
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select jsonb_build_object(
      'email', nullif(current_setting('test.email', true), ''),
      'role', auth.role(),
      -- Assurance level: tests act as a fully signed-in user (aal2) unless
      -- they call setAssuranceLevel(db, "aal1").
      'aal', coalesce(nullif(current_setting('test.aal', true), ''), 'aal2')
    )
  $$;
  grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
  -- PGlite has no pgcrypto; the migrations only use digest(text, 'sha256').
  create schema if not exists extensions;
  create function public.digest(data text, algorithm text) returns bytea language sql immutable as $$
    select case when lower(algorithm) = 'sha256' then sha256(convert_to(data, 'UTF8')) end
  $$;
  create function extensions.digest(data text, algorithm text) returns bytea language sql immutable as $$
    select public.digest(data, algorithm)
  $$;
`;

// Statements the stand-in already provides, or PGlite cannot run.
function adaptForPglite(sql: string): string {
  return sql.replace(/create\s+extension\s+if\s+not\s+exists\s+pgcrypto[^;]*;/gi, "");
}

export function migrationFiles(dir = path.join(process.cwd(), "supabase", "migrations")): string[] {
  return fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort().map((name) => path.join(dir, name));
}

export async function createMigratedDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    try {
      await db.exec(adaptForPglite(fs.readFileSync(file, "utf8")));
    } catch (error) {
      throw new Error(`Migration ${path.basename(file)} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return db;
}

export async function asUser(db: PGlite, userId: string | null, email = "") {
  await db.exec(`reset role; select set_config('test.uid', '${userId ?? ""}', false), set_config('test.role', 'authenticated', false), set_config('test.email', '${email.replace(/'/g, "''")}', false)`);
}

// Act as a real API client: grants and RLS apply.
export async function asClient(db: PGlite, role: "anon" | "authenticated", userId: string | null = null, email = "") {
  await db.exec("reset role");
  await db.exec(`select set_config('test.uid', '${role === "anon" ? "" : userId ?? ""}', false), set_config('test.role', '${role}', false), set_config('test.email', '${email.replace(/'/g, "''")}', false)`);
  await db.exec(`set role ${role}`);
}

// The session's authenticator assurance level: "aal1" after the password
// only, "aal2" after a second factor. Persists until changed.
export async function setAssuranceLevel(db: PGlite, level: "aal1" | "aal2") {
  await db.exec(`select set_config('test.aal', '${level}', false)`);
}

// Back to the table owner (RLS not applied), keeping the current claims.
export async function asOwner(db: PGlite) {
  await db.exec("reset role");
}

export async function asService(db: PGlite) {
  await db.exec(`reset role; select set_config('test.uid', '', false), set_config('test.role', 'service_role', false)`);
}
