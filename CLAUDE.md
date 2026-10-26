# InsureLead Intelligence: working rules

## Security (every feature, every change)

Use the `nextjs-supabase-security` skill for all development and reviews in this repo,
not only when security is mentioned. In short:

- The database enforces access (RLS, grants, SECURITY DEFINER functions that re-check
  `auth.uid()`), the server re-checks it (`getDashboardIdentity()` in every Route Handler
  and Server Action), and the UI only reflects it. Never trust a client-supplied
  organisation, profile or role.
- New table: enable RLS, `revoke all ... from public, anon, authenticated`, then grant only
  what is needed. New function: pin `search_path`, revoke from `public, anon, authenticated`,
  grant explicitly; server-only functions check `auth.role() = 'service_role'`.
- Every migration starts with a comment saying who can now do what.
- Add access-control cases to `src/lib/access-control-db.test.ts` (it runs every migration
  as the real `anon` and `authenticated` roles, with Supabase's default privileges). Use
  `asClient(db, "anon" | "authenticated", id)` to test what a client can do; `asUser` and
  `asService` run as the table owner, where RLS does not apply.
- Public or paid actions (sign-up, sign-in, reset, invites, email, lead capture) need
  durable rate limits (`src/lib/security/rate-limit.ts`) that run before any side effect.
- Service-role/secret keys stay in server modules only; never prefix a secret with
  `NEXT_PUBLIC_`.
- Synthetic data only. Ask before any destructive production change.
- Report which checks ran and what is still unverified. Never claim the app is secure.

## Checks

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

Work on a feature branch and open a pull request into `main`; never push to `main`.
