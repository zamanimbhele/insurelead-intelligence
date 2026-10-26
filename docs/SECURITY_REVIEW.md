# Security review: October 2026

A review of the database policies, server entry points, secrets handling and abuse
controls, done with the `nextjs-supabase-security` skill. It records what was checked,
what was fixed, and what is still open. It is not a guarantee that the application is
secure.

## What was checked

| Area | How |
| --- | --- |
| RLS on every public table, policies, grants, SECURITY DEFINER functions | All 28 migrations loaded into an in-memory Postgres with Supabase's default privileges, then queried from the system catalogue and tested as the real `anon` and `authenticated` roles (`src/lib/access-control-db.test.ts`) |
| Every Route Handler and Server Action | Read each one for an identity check, a role check and a tenant-scoped data call |
| Proxy, layouts, redirects | Read `src/proxy.ts`, sign-in actions and the `next` handling in auth links |
| Secrets | `NEXT_PUBLIC_*` variables listed, service-role usage traced, gitleaks over git history and tracked folders, production client bundle searched for secret names |
| Inputs and injection | Lead capture, CSV export, unsubscribe page, webhook verification, HTML rendering |
| Bots and abuse | Rate limits and CAPTCHA on public forms, sign-in, invitations; cron authentication |
| Dependencies | `npm audit` |

## Findings and fixes

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | Critical (deps) | `next` 16.3.4 is affected by published advisories, including remote code execution in image optimisation and `use cache`; `zod`, `sharp` and the MCP server SDK also have high advisories | Separate pull request: dependency updates |
| 2 | High | **FYE campaign plans were shared across all workspaces**: any signed-in user could read every broker's plans (title, notes, creator email) and change their status | Plans now belong to a workspace; status changes are checked against it (migration `202610270001`) |
| 3 | Medium | **Sign-in had no effective rate limit**: the Server Action calls Supabase from the server, so Supabase's per-IP limit sees the server's IP, not the attacker's | Durable per-IP and per-email limits before the password check (`src/lib/security/sign-in-limits.ts`) |
| 4 | Medium | **Admin audit entries were refused**: the audit-log export, retention and hotspot routes insert with the admin's session, but `authenticated` only had SELECT, so exports failed and setting changes were saved without an audit entry | Admins may add entries in their own name only (`actor_id` must equal `auth.uid()`) |
| 5 | Medium | **Demo mode was the default** when `INSURELEAD_DATA_MODE` is unset; demo mode signs everyone in as a demo administrator | Production (`VERCEL_ENV=production`) now refuses to start without an explicit mode |
| 6 | Low | Team invitations (each sends an email) had no limit | 20 invitations per workspace per day |
| 7 | Low | Lead capture stored the `utm`, `referrer` and `sourceUrl` fields unvalidated; a non-string UTM value would break the lead page for staff | Only known UTM keys, bounded strings and http(s) URLs are kept |
| 8 | Low | Write policies on `campaigns`, `campaign_content_versions`, `campaign_approvals` and `lead_outcomes` had no grant behind them (no effect today) but would have allowed approval bypass if a grant were ever added | Removed or replaced with read-only policies |
| 9 | Hardening | Default table privileges let any future table start with write access for `anon` until its migration revoked it; nothing stopped TRUNCATE by API roles beyond each table's own revoke | Writes, TRUNCATE, TRIGGER and REFERENCES revoked from the public key on every table and by default |
| 10 | Hardening | Unsubscribe page put the (verified) token into the form URL unencoded | Encoded |

Verified as already in place: RLS enabled on every public table; every SECURITY DEFINER
function pins `search_path`; server-only functions are not executable by `anon` or
`authenticated`; every protected route checks identity and role; redirects after sign-in
and from email links are allowlisted; cron routes compare the secret in constant time and
refuse to run without one; the Resend webhook verifies the Svix signature on the raw body
with a 5-minute window and is idempotent; CAPTCHA and rate limits fail closed; no secret is
exposed through `NEXT_PUBLIC_`.

## Still open

| Priority | Item | Next step |
| --- | --- | --- |
| 1 | **No MFA for administrators** | Add Supabase TOTP enrolment and an `aal2` check on the admin sign-in, admin routes and (optionally) `is_platform_admin()` |
| 2 | Production grants not verified directly | Run `docs/sql/verify-access-control.sql` (read-only) in the Supabase SQL editor after the migration |
| 3 | Approval and content RPCs can be called directly with the public key and a session, skipping the app's disclosure checks (scheduling still re-checks them) | Move the disclosure check into `approve_campaign_content()` |
| 4 | Supabase Auth settings not inspected (leaked-password protection, email rate limits, sign-up confirmation) | Check in Supabase Dashboard → Authentication |
| 5 | Lead-route body size is bounded only by the platform limit | Add a request-size check |
| 6 | `/api/health` tells anyone which protections are configured | Return only `status` publicly; full detail behind the cron secret |
| 7 | No static analysis (Semgrep/CodeQL) in CI | Enable GitHub CodeQL for the repository |
