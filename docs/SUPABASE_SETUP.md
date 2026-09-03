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

Only one person should push migrations to a shared project at a time. The two migrations in
`supabase/migrations` are applied in timestamp order.

## 2. Configure server secrets

Copy `.env.example` to `.env.local` and set:

```dotenv
INSURELEAD_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
INSURELEAD_MCP_ALLOW_WRITES=false
```

Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` values are also supported.
The secret/service-role key bypasses RLS: store it only in server-side environment settings.
Never paste it into browser code, a URL, logs, Git, chat, email, or screenshots.

For Vercel, add the same variables under Project Settings → Environment Variables. Use separate
Supabase projects or branches for preview/testing and production.

## 3. Bootstrap the first administrator

1. In Supabase Authentication → Users, create or invite the initial administrator.
2. Open `supabase/bootstrap-admin.example.sql`.
3. Replace both `REPLACE_*` placeholders.
4. Run the script in the Supabase SQL editor.

The user can then sign in at `/login`. A valid Auth user without a profile is denied dashboard
access; this prevents newly created accounts from becoming administrators automatically.

## 4. Add approved pilot buyers

For every contracted broker or insurer:

1. Copy `supabase/add-pilot-buyer.example.sql`.
2. Replace the organisation name and contact email.
3. Set `buyer_kind` to `broker` or `insurer`.
4. Confirm provinces, industries, minimum score, shared-lead preference, FSP details, pricing,
   and the signed data-processing/lead-supply agreement before activation.
5. Run the reviewed SQL in the Supabase SQL editor.

The marketplace matches only active buyers whose stored appetite matches the lead. The database
reservation function locks the lead, verifies current consent, enforces recipient/exclusivity
limits, and records an audit entry atomically.

## 5. Validate before accepting real leads

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Then validate in a non-production environment:

- `/consultation` creates one lead, one consent record, and one audit record.
- `/login` rejects an unprofiled user and accepts the platform administrator.
- `/dashboard` is inaccessible after signing out.
- `/dashboard/marketplace` shows only consented, allocatable leads.
- Reserving a lead creates one allocation and prevents a second exclusive reservation.
- A buyer account sees only records permitted by RLS.

## 6. MCP production mode

The MCP server reads the same Supabase records when `INSURELEAD_DATA_MODE=supabase`. Its process
has elevated server access, so run it only on a trusted machine. Production MCP mutations remain
blocked unless `INSURELEAD_MCP_ALLOW_WRITES=true` is deliberately set after access review.

## Remaining go-live gates

Supabase and authentication do not complete the production hardening. Before public marketing,
add durable rate limiting, CAPTCHA/bot protection, internal lead notifications, retention and
deletion workflows, monitoring, backups, secret rotation, and a legal/compliance review of the
privacy notice and partner-sharing wording.
