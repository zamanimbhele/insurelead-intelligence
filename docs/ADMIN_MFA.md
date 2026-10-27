# Two-step sign-in for platform staff

Platform staff (platform admin, compliance admin, compliance auditor) sign in with their
password **and** a 6-digit code from an authenticator app. Brokers are not affected.

## How it works

1. Staff sign in at `/admin/login` (or `/login`) with their password.
2. They are sent to `/admin/mfa`:
   - **First time:** "Set up authenticator app" shows a QR code (and a key to type in).
     Scan it with Google Authenticator, Microsoft Authenticator, 1Password or similar,
     then enter the 6-digit code.
   - **Every sign-in after that:** enter the current code.
3. Supabase marks the session `aal2`. Only then do admin pages, admin API routes and the
   database treat the person as staff.

## Where it is enforced

| Layer | Check |
| --- | --- |
| Database, every Data API request | `public.enforce_staff_mfa()` runs before each request (`pgrst.db_pre_request`) and refuses staff sessions below `aal2` |
| Database, RLS and functions | `is_platform_admin()` and `is_compliance_auditor()` are false below `aal2` |
| Server | `getDashboardIdentity()` denies staff below `aal2` (every route and page uses it) and the dashboard sends them to `/admin/mfa` |
| Abuse | Code checks are limited to 10 per 15 minutes per person; set-ups to 5 per hour. An authenticator cannot be added with only a password once one exists |

Migration: `supabase/migrations/202610280001_admin_mfa.sql`. Tests:
`src/lib/access-control-db.test.ts` (database) and `src/lib/staff-mfa.test.ts` (sign-in steps).

## Rolling it out

1. Check that TOTP MFA is enabled: Supabase Dashboard → Authentication → Multi-Factor
   (it is on by default for new projects).
2. Merge and deploy the app **before** running the migration, so the `/admin/mfa` page exists
   when the database starts requiring it.
3. Run the migration. Every staff member is asked to set up their authenticator at their
   next sign-in. Nobody is locked out: setting up only needs the password session.
4. Ask each staff member to sign in once and complete the set-up.

## A staff member lost their phone

Another administrator (or the project owner) removes the old authenticator:
Supabase Dashboard → Authentication → Users → the user → **MFA factors** → delete. The
person signs in again and sets up a new one. Record why in the audit log.

## Emergency switch-off (no administrator can sign in)

In the Supabase SQL editor:

```sql
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';
```

This removes only the per-request check. The admin checks in RLS still require `aal2`,
so also remove the locked-out person's factor (above), sign in, set it up again, then
re-run the migration to switch the request check back on.
