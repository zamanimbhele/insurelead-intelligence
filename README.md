# InsureLead Intelligence — MVP Prototype

Business Insurance Lead Intelligence Platform for a South African business insurance broker.
This repository is a **working functional prototype**: the public lead-capture site and the
internal broker dashboard both run end-to-end against a local, file-based demo data store, so it
can be reviewed and clicked through without any external services.

This prototype uses **placeholder branding and 100% synthetic demo data**. No OUTsurance
branding, logos, policy wording, premiums, FSP details, or insurer integrations are included.

## What's included in this prototype

- Public marketing site: Home, Business Insurance Solutions, Industry Solutions, About, FAQs,
  Privacy Notice, Terms of Use, Contact Us.
- Four-step **Request a Business Insurance Consultation** form (Business Details → Insurance
  Needs → Contact Person → Consent), built with React Hook Form + Zod, including a honeypot field,
  UTM capture, and a generic thank-you page that never exposes submitted data in the URL.
- A working `POST /api/leads` endpoint: validates input server-side, runs the transparent lead
  scoring model, detects likely duplicates, writes a consent record and an audit log entry, and
  applies a basic in-memory rate limit.
- Internal dashboard (`/dashboard`): overview widgets, a searchable/filterable leads table, a lead
  detail page (score explanation, business/contact detail, source attribution, Do Not Contact
  flag), and a Market Intelligence view with aggregated, threshold-gated charts.
- 64 synthetic demo leads seeded via `scripts/generate-seed.mjs` — no real business or personal
  data anywhere in the repo.

## What is intentionally out of scope for this prototype

This is the "working functional prototype" phase, not the full production build. Deferred to the
full build (see `BACKLOG.md`): Supabase/PostgreSQL + Row Level Security, authentication and full
role-based access control, the Kanban pipeline, notes/tasks/call logging, CAPTCHA and durable rate
limiting, the Data Source Registry, hotspot/industry opportunity dashboards, the financial
year-end campaign planner, the compliance dashboard, CSV export controls, and the automated test
suite (Vitest/Playwright). The full scope is documented in the project's build specification and
priced in the accompanying quotation.

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · React Hook Form · Zod · Recharts · Lucide
icons. No database is required to run this prototype — see "Moving to Production" below.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 for the public site, or http://localhost:3000/dashboard for the
internal broker dashboard.

To regenerate the synthetic demo leads:

```bash
node scripts/generate-seed.mjs
```

Copy `.env.example` to `.env.local` before running in an environment that needs the optional
variables (notifications, CAPTCHA, etc.) — the prototype runs without any of them populated.

## Project structure

```
src/
  app/
    (site)/          Public marketing pages + consultation form + thank-you page
    (dashboard)/      Internal broker dashboard (overview, leads, lead detail, market intelligence)
    api/leads/        POST endpoint: validation, scoring, consent + audit logging
  components/
    site/             Public site sections (Hero, categories, FAQ, compliance reassurance...)
    forms/             Multi-step consultation form and its per-step field groups
    dashboard/         Dashboard widgets, leads table, badges, charts
    ui/                Small shared UI primitives (Button, Section)
  lib/
    types.ts           Core domain types (mirrors future Supabase schema)
    validation/         Zod schemas for the consultation form
    scoring.ts          Transparent lead scoring engine
    demo-store.ts       File-based demo data store (see note below)
    constants.ts        Reference lists (industries, provinces, products, consent version...)
data/
  leads.json            Synthetic seeded leads (generated, not hand-written)
scripts/
  generate-seed.mjs     Synthetic data generator
```

## Moving to production

`src/lib/demo-store.ts` is the only prototype-specific module. It reads/writes local JSON files
so the app is runnable without infrastructure. To move to production, replace it with Supabase
(PostgreSQL + Row Level Security) calls behind the same function signatures
(`getLeads`, `saveLead`, `saveConsent`, `appendAuditLog`, ...), and add:

1. Supabase Auth + role-based access control (Super Admin, Compliance Admin, Broker Manager,
   Broker, Marketing Analyst) as specified in the platform build document.
2. Database migrations for the full schema (`leads`, `lead_consents`, `lead_assignments`,
   `campaigns`, `data_sources`, `audit_logs`, etc.) with Row Level Security on every sensitive
   table.
3. A real CAPTCHA provider and a durable rate limiter (e.g. Upstash) in front of `/api/leads` —
   the route is already structured to slot these in.
4. Secure internal notifications (email/queue) to the assigned broker on new lead creation.
5. The remaining Phase 2–5 modules listed in `BACKLOG.md`.

## Compliance notes

- No ID numbers, banking details, payment card data, or medical information are collected.
- The consultation form requires explicit, non-preselected consent, records a consent wording
  version and timestamp, and never pre-ticks marketing consent.
- The lead scoring engine only uses business attributes (industry, size, turnover, cover
  selected, renewal timing, campaign source) — never protected characteristics — and always
  renders a plain-language explanation alongside the score.
- No automated insurance advice, premiums, or underwriting decisions are generated anywhere in
  this prototype.
