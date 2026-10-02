# Supabase production-pilot setup

This setup switches InsureLead from synthetic JSON files to PostgreSQL, enables cookie-based
Supabase authentication, and enforces dashboard access through Row Level Security (RLS).

## 1. Create and link a Supabase project

Create a Supabase project for the pilot, then from the repository root run:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push
```

Only one person should push migrations to a shared project at a time. Migrations in
`supabase/migrations` are applied in timestamp order.

## 2. Configure server secrets

Copy `.env.example` to `.env.local` and set:

```dotenv
INSURELEAD_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
INSURELEAD_MCP_ALLOW_WRITES=false
RATE_LIMIT_HASH_SECRET=YOUR_RANDOM_32_PLUS_CHARACTER_SECRET
LEAD_RATE_LIMIT_MAX=5
LEAD_RATE_LIMIT_WINDOW_SECONDS=60
```

Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` values are also supported.
The secret/service-role key bypasses RLS: store it only in server-side environment settings.
Never paste it into browser code, a URL, logs, Git, chat, email, or screenshots.

For Vercel, add the same variables under Project Settings → Environment Variables. Use separate
Supabase projects or branches for preview/testing and production.

After the core connection works, follow [`PILOT_HARDENING.md`](PILOT_HARDENING.md) to configure
Turnstile, lead-queue notifications, and the readiness endpoint.

## 3. Configure the email confirmation template

The app's `app/auth/confirm/route.ts` route handler verifies signups by reading
`token_hash` and `type` query parameters and calling `supabase.auth.verifyOtp(...)`. Supabase's
default "Confirm signup" email template does **not** link there: it links to the hosted
`{{ .ConfirmationURL }}` on Supabase's own Auth server, which confirms the user directly and
bypasses this app's route entirely.

For the confirmation page and messaging on `/login` to actually be used in production, update
the email template in the Supabase Dashboard:

1. Go to Authentication → Email Templates → Confirm signup.
2. Replace the default body's link so it points at this app's route instead of
   `{{ .ConfirmationURL }}`:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">
     Confirm your email
   </a>
   ```

3. Under Authentication → URL Configuration, set **Site URL** to the deployment's public URL
   (matching `NEXT_PUBLIC_APP_URL`), and add that same URL (and any preview URLs) to
   **Redirect URLs**. `{{ .SiteURL }}` in the template above resolves from this setting.
4. Repeat the same `token_hash`/`type` link pattern for any other enabled template that should
   land on this route (for example "Reset password" uses `type=recovery`, "Change email address"
   uses `type=email_change`) if those flows are enabled.
5. Send a real test signup to a mailbox you control and confirm the link lands on
   `/login?message=email_confirmed`; an expired or already-used link should land on
   `/login?error=confirmation_failed`.

Skipping this step is the most common reason "email confirmation isn't working" in a fresh
Supabase project: the code path is correct, but the email never links to it.

## 4. Bootstrap the first administrator

1. In Supabase Authentication → Users, create or invite the initial administrator.
2. Open `supabase/bootstrap-admin.example.sql`.
3. Replace both `REPLACE_*` placeholders.
4. Run the script in the Supabase SQL editor.

The user can then sign in at `/login`. A valid Auth user without a profile is denied dashboard
access; this prevents newly created accounts from becoming administrators automatically.

## 5. Add approved pilot buyers

For every contracted broker or insurer:

1. Copy `supabase/add-pilot-buyer.example.sql`.
2. Replace the organisation name, URL-safe slug, contact email, FSP number, and sending identity placeholders.
3. Set `buyer_kind` to `broker` or `insurer`.
4. Confirm provinces, industries, minimum score, shared-lead preference, FSP details, pricing,
   and the signed data-processing/lead-supply agreement before activation.
5. Run the reviewed SQL in the Supabase SQL editor.

The marketplace matches only active buyers whose stored appetite matches the lead. The database
reservation function locks the lead, verifies current consent, enforces recipient/exclusivity
and daily-capacity limits, and records an audit entry atomically. Follow
[`BROKER_TENANCY_SETUP.md`](BROKER_TENANCY_SETUP.md) to attach broker users and validate tenant isolation.
After broker tenancy is working, follow [`CAMPAIGN_MCP_SETUP.md`](CAMPAIGN_MCP_SETUP.md) to apply
the campaign migration and enable campaign delivery safely.

## 6. Validate before accepting real leads

```bash
npm ci
npm run typecheck
npm run lint
npm run test:tenancy
npm run test:campaigns
npm run build
npm run test:e2e
```

Then validate in a non-production environment:

- `/consultation` creates one lead, one consent record, and one audit record.
- `/login` rejects an unprofiled user and accepts the platform administrator.
- `/dashboard` is inaccessible after signing out.
- `/dashboard/marketplace` shows only consented, allocatable leads.
- `/dashboard/brokers` shows every tenant only to platform oversight roles.
- `/dashboard/allocations` lets a broker operator accept or release only its organisation's reservations.
- Reserving a lead creates one allocation and prevents a second exclusive reservation.
- A buyer account sees only records permitted by RLS.
- `/api/health` reports the Supabase data store and durable rate limiter as configured.

## 7. MCP production mode

The MCP server reads the same Supabase records when `INSURELEAD_DATA_MODE=supabase`. Its process
has elevated server access, so run it only on a trusted machine. Production MCP mutations remain
blocked unless `INSURELEAD_MCP_ALLOW_WRITES=true` is deliberately set after access review.

## Remaining go-live gates

The repository now includes durable rate limiting, configurable CAPTCHA, internal webhook
notifications, and a readiness endpoint. They still need to be configured and tested in every
deployed environment using `PILOT_HARDENING.md`. Before broader public marketing, also complete
retention and deletion workflows, external monitoring, backups, secret rotation, and a
legal/compliance review of the privacy notice and partner-sharing wording.
