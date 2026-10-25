// Test helper: an in-memory Postgres (PGlite) with every migration in
// supabase/migrations applied in order, on top of a minimal stand-in for
// the parts of Supabase the migrations rely on (auth schema, roles,
// auth.uid()/auth.jwt()/auth.role()). Lets tests exercise the real
// database functions, policies and triggers.
//
// Acting as a user: `await asUser(db, profileId)` makes auth.uid() return
// that id for the following statements; `asService(db)` sets the
// service_role claim. Row-level security is NOT applied (PGlite runs as
// the owner), so tests of policies call the policy's helper functions or
// the SECURITY DEFINER functions, which is where this codebase puts its
// rules.
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema if not exists auth;
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
    select jsonb_build_object('email', nullif(current_setting('test.email', true), ''), 'role', auth.role())
  $$;
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
  await db.exec(`select set_config('test.uid', '${userId ?? ""}', false), set_config('test.role', 'authenticated', false), set_config('test.email', '${email.replace(/'/g, "''")}', false)`);
}

export async function asService(db: PGlite) {
  await db.exec(`select set_config('test.uid', '', false), set_config('test.role', 'service_role', false)`);
}
