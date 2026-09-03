# InsureLead Intelligence — MVP Prototype

Business Insurance Lead Intelligence Platform for a South African business insurance broker.
This repository supports two explicit operating modes: a local **synthetic demo** backed by JSON
files, and a **Supabase production-pilot mode** with PostgreSQL persistence, cookie-based
authentication, Row Level Security, and audited lead allocation.

This prototype uses **placeholder branding and 100% synthetic demo data**. No OUTsurance
branding, logos, policy wording, premiums, FSP details, or insurer integrations are included.

[![CI](https://github.com/zamanimbhele/insurelead-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/zamanimbhele/insurelead-intelligence/actions/workflows/ci.yml)

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
- A Playwright end-to-end test suite and a GitHub Actions CI pipeline that lints, type-checks,
  builds, and runs the suite on every push and pull request to `main`.
- A local MCP server that exposes consent-aware lead search, prioritisation, pipeline updates,
  summaries, and human-review follow-up drafting to compatible AI assistants.
- Optional Supabase persistence for lead capture, consent, buyers, allocations, and audit logs.
- Password authentication for the internal dashboard, with profile and organisation checks.

## What is intentionally out of scope for this prototype

This remains a production-pilot foundation, not the full production build. Deferred to the full
build (see `BACKLOG.md`): the Kanban pipeline, notes/tasks/call logging, CAPTCHA and durable rate
limiting, the Data Source Registry, hotspot/industry opportunity dashboards, the financial
year-end campaign planner, the compliance dashboard, CSV export controls, buyer self-service,
contracting, and invoicing/payment collection. The full scope is documented in the project's
build specification and priced in the accompanying quotation.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase · React Hook Form · Zod ·
Recharts · Lucide icons · Playwright (E2E) · GitHub Actions (CI). No database is required in demo
mode — see "Moving to Production" below.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 for the public site, or http://localhost:3000/dashboard for the
internal broker dashboard.

### Run the MCP server

```bash
npm run mcp
```

Example MCP client configuration (replace the path with your local clone):

```json
{
  "mcpServers": {
    "insurelead": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/insurelead-intelligence", "run", "mcp"]
    }
  }
}
```

Use `npm run mcp:inspect` to test each tool interactively. The server does not scrape websites,
send outreach, provide insurance advice, or make underwriting decisions. Contact details and
follow-up drafts are available only for leads with recorded contact consent, and every draft
requires human approval before sending.

To regenerate the synthetic demo leads:

```bash
node scripts/generate-seed.mjs
```

Copy `.env.example` to `.env.local` before running in an environment that needs the optional
variables (notifications, CAPTCHA, etc.) — the prototype runs without any of them populated.

### Enable Supabase mode

Follow [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) to apply the migrations, configure
server-only secrets, bootstrap the first administrator, and add approved pilot buyers. Demo mode
remains the default so CI and local product demonstrations never require production credentials.

## Testing

End-to-end tests use [Playwright](https://playwright.dev) and cover the platform's core MVP
acceptance criteria: the public site renders, the four-step consultation form validates input and
gates submission on required consent, a completed submission lands on a generic thank-you page
with no PII in the URL, and the internal dashboard (overview, leads list, lead detail, market
intelligence) renders against the seeded demo data.

```bash
npx playwright install --with-deps chromium   # first time only
npm run test:e2e                              # headless run
npm run test:e2e:ui                           # interactive UI mode, useful while developing
npm run test:e2e:report                       # open the last HTML report
```

Tests run serially against a single worker on purpose: `src/lib/demo-store.ts` is a flat JSON
file on disk, not a real database, so parallel workers writing at the same time could race. This
reverts to normal parallel execution once the app moves to Supabase.

Running `npm run test:e2e` locally will add a couple of clearly-labelled synthetic leads (for
example `E2E Test Business <timestamp>`) into your local `data/leads.json` — harmless, but you can
regenerate clean seed data afterwards with `node scripts/generate-seed.mjs` if it bothers you.

### CI pipeline

`.github/workflows/ci.yml` runs on every push and pull request to `main`: install → `eslint .` →
`tsc --noEmit` → `next build` → install Playwright's Chromium browser → run the E2E suite. The
Playwright HTML report is uploaded as a build artifact on every run (and screenshots/traces are
attached on failure) so a failing run in GitHub Actions can be diagnosed without reproducing it
locally.

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
    types.ts           Core domain types shared by demo and Supabase repositories
    validation/         Zod schemas for the consultation form
    scoring.ts          Transparent lead scoring engine
    demo-store.ts       File-based demo data store (see note below)
    constants.ts        Reference lists (industries, provinces, products, consent version...)
  mcp/
    server.ts            Consent-aware MCP tools for AI assistants
data/
  leads.json            Synthetic seeded leads (generated, not hand-written)
scripts/
  generate-seed.mjs     Synthetic data generator
e2e/
  home.spec.ts                     Public site smoke tests
  consultation-flow.spec.ts        Full 4-step submission happy path
  consultation-validation.spec.ts  Field validation + consent gating
  dashboard.spec.ts                Internal dashboard rendering
.github/workflows/
  ci.yml                 Lint, type-check, build, and E2E pipeline
```

## Moving to production

Set `INSURELEAD_DATA_MODE=supabase` to use the Supabase repositories. In this mode public lead
capture is written atomically to PostgreSQL, dashboard reads use the signed-in user session and
RLS, and marketplace reservations re-check consent and allocation limits inside the database.
The remaining production work includes:

1. Expand role-based access control beyond the production-pilot roles and add an administration UI.
2. Expand the database schema (`lead_assignments`,
   `campaigns`, `data_sources`, `audit_logs`, etc.) with Row Level Security on every sensitive
   table.
3. A real CAPTCHA provider and a durable rate limiter (e.g. Upstash) in front of `/api/leads` —
   the route is already structured to slot these in.
4. Secure internal notifications (email/queue) to the assigned broker on new lead creation.
5. A buyer portal for accepting/releasing allocated leads, plus contract, billing, dispute, and
   refund workflows. The pilot deliberately keeps allocation under platform-admin control.
6. The remaining Phase 2–5 modules listed in `BACKLOG.md`.
7. Once on Supabase, revisit `playwright.config.ts` — parallel workers become safe again, and CI
   can seed/reset a dedicated test database per run instead of writing to `data/leads.json`.

## Compliance notes

- No ID numbers, banking details, payment card data, or medical information are collected.
- The consultation form requires explicit, non-preselected consent, records a consent wording
  version and timestamp, and never pre-ticks marketing consent.
- The lead scoring engine only uses business attributes (industry, size, turnover, cover
  selected, renewal timing, campaign source) — never protected characteristics — and always
  renders a plain-language explanation alongside the score.
- No automated insurance advice, premiums, or underwriting decisions are generated anywhere in
  this prototype.
