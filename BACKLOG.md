# Phase 2+ Backlog — InsureLead Intelligence

Scope not included in the working functional prototype, grouped by the phased build plan.
Priced in the accompanying quotation.

## Foundation & Data Layer
- Production-pilot foundation completed: Supabase persistence for leads, consent, approved buyers,
  allocations and audit logs; cookie-based dashboard authentication; RLS; and atomic consent-aware
  capture/allocation functions.
- Multi-product foundation completed: product catalogue, individual/business intake, preservation
  of existing commercial cover selections, product-aware buyer appetite, product filtering, and
  read-only MCP product discovery.
- Multi-broker tenancy completed: organisation-scoped broker roles, allocated-lead RLS, broker
  profile/directory views, territory and capacity controls, sending identities, auditable matching,
  and controlled allocation acceptance/release.
- Campaign-generation MCP foundation completed: broker-owned product campaigns, immutable content
  versions and approvals, consent/allocation/suppression audience gates, verified Resend identities,
  explicit bounded launches, delivery events, aggregate performance, and a campaign dashboard.
- Expand the Supabase schema for the full build: users, user_roles, broker_profiles,
  teams, leads, lead_contacts, lead_insurance_needs, lead_consents, lead_assignments,
  lead_activities, lead_notes, lead_tasks, lead_scores, lead_sources, campaigns,
  campaign_attribution, campaign_metrics, data_sources, data_source_approvals, market_signals,
  hotspot_snapshots, industry_snapshots, financial_year_calendars, opt_out_requests,
  data_subject_requests, audit_logs, application_settings.
- Extend Row Level Security policies to every future sensitive table.
- Add a platform administration UI for invitations, role changes, organisation approval, and
  sending-domain verification; the database roles and tenant policies are already in place.

## Lead Capture Hardening
- Production-pilot hardening foundation completed: Cloudflare Turnstile integration, a durable
  Supabase rate limiter using HMAC-keyed counters, PII-minimised lead-queue webhooks, notification
  audit events, and `/api/health` readiness reporting. Deployment configuration and monitoring
  remain operational tasks.
- Configurable legal-text fields completed: all 7 documents the brief's section 2 names (privacy
  notice, consent wording, contact-permission wording, marketing wording, FSP disclosures, terms
  of use, data retention policy text) now live in `legal_text_documents` (current published text)
  plus an append-only `legal_text_document_versions` history - the same current-state-plus-history
  split as the Data Source Registry - edited at `/dashboard/legal-content`, gated the same way as
  the registry (`canViewCompliance()` to view and its own version history, `canManageCompliance()`
  to edit: platform/compliance admins only, not auditors). Every save goes through the
  `update_legal_text_document()` SECURITY DEFINER RPC, never a direct table update: it re-checks
  the caller's role itself, bumps the version, appends the prior text to history (so nothing is
  ever silently overwritten), and writes its own `audit_logs` entry - mirroring every other
  compliance-table write in this codebase. These documents are no longer hardcoded JSX: the public
  Privacy Notice and Terms of Use pages, and the consultation form's three consent-step checkboxes
  (contact permission, partner-sharing consent, optional marketing consent), now read the live
  content through `getRuntimeLegalTextDocument()` (the service-role admin-client path the public
  lead-capture route already used, since these pages render before anyone signs in - see
  `runtime-data.ts`), and a lead's own `consentWordingVersion` is derived from the live
  `consent_wording` document's current version rather than a static constant, with that constant
  kept only as a defensive fallback if the fetch itself fails. `renderLegalTextParagraphs()` in
  `lead-utils.ts` is the one place a document's blank-line-separated paragraphs are split for
  rendering, shared by both public pages and the admin editor's read-only preview.
  Also fixed in service of this item, and worth calling out on its own: `audit_logs.entity_id` is
  `uuid not null`, but three existing call sites to `appendSupabaseAuditLog()` were passing
  natural-language strings (`"audit_log"`, `"application_settings"`) as `entityId` - one from this
  session's own Audit Log Viewer PR, two pre-existing. In real Supabase mode this was a silent
  false-failure bug: the actual update would succeed, then the audit-log insert would throw
  `invalid input syntax for type uuid`, and the route's catch block would report the save as
  failed even though it had worked. Demo mode never caught this (its JSON audit log has no type
  constraint), and neither does `tsc`/`eslint` - only manually tracing the migration SQL found it.
  Fixed once, centrally, in `appendSupabaseAuditLog()` itself: a non-UUID `entityId` now gets a
  fresh `randomUUID()` for the column and the original label is folded into `details.message` as
  plain text, so the Audit Log Viewer's Details column still renders one readable sentence. The
  new `update_legal_text_document()` RPC was written to avoid the same mistake from the start.
  Known gap: this item's Playwright e2e coverage (`e2e/legal-content.spec.ts`) was written and
  type/lint-checked but could not be executed end-to-end in this development environment - the
  remote device-bridge shell used for this session's work is backed by a notably slow filesystem
  (Next.js's own dev server prints its own "Slow filesystem detected" warning there), and each
  individual command invocation in that environment is capped well under the time a `next build`
  or even first-request `next dev` compile actually takes, so the Playwright-managed web server
  could not reliably come up within a single invocation. A plain `next dev` run in that same
  environment did start and serve the app correctly end to end in demo mode (confirming no runtime
  regression), so this is a tooling/environment limitation rather than a known defect - but the
  new spec file has not had a real Playwright pass recorded against it the way every other e2e
  spec in this repo has, and should be run for real in CI or a normal local setup before being
  trusted the same way.

## Broker Workflow
- Add visual campaign authoring and approval forms on top of the completed MCP campaign workflow.
- Kanban pipeline completed: drag-and-drop (plus a keyboard-accessible "Move to" select) across all
  13 lead statuses, gated by a platform-admin-or-allocated-broker-operator check in a SECURITY
  DEFINER database function, with the Do Not Contact flag kept in sync and every move audited.
- Lead activity workflow completed: notes, call/email/meeting logging, follow-up tasks (with due
  dates and an optional assignee), a unified chronological activity timeline covering creation,
  notes, logged interactions, task lifecycle, and status/Do Not Contact changes, and required
  loss-reason capture when a lead moves to Lost - all behind the same platform-admin-or-allocated-
  broker-operator SECURITY DEFINER checks as the Kanban board's update_lead_status(), reusing
  canUpdateLeadStatus() as the single write-gate across notes/tasks/interactions/status. "Follow-up
  reminders" here means due-dated tasks surfaced on the lead profile; a separate notification/digest
  mechanism that proactively alerts a broker when a task is due or overdue is still open.
- Do Not Contact workflow enforcement across all outreach surfaces (the Kanban board and the lead
  profile's Pipeline & Outcome card can now set and clear the flag; blocking it from campaign/
  notification surfaces is still open).

## Buyer Commerce
- Extend the initial audited acceptance/release workspace with reassignment, dispute evidence, and
  broker-manager administration.
- Contract, pricing-plan, invoice, payment, credit/refund, and lead-dispute workflows.

## Market Intelligence
- Geographic hotspot dashboard completed: a `/dashboard/market-intelligence/hotspots` page breaking
  demand down by province, by municipality (province + city), and by suburb (province + city +
  suburb) - each level independently gated by the same admin-configurable minimum lead volume
  (`application_settings.hotspot_min_lead_threshold`, default 10 per the brief's own example) so a
  small, potentially identifiable area is never shown; lowering it is instant and the suburb table
  honestly reports "no suburb meets the minimum yet" rather than fabricating a row. Each visible
  area carries a lead volume, a growth rate (trailing 60 days vs. the 60 days before that - null,
  not a fake 0%, when there isn't enough prior-period history yet), a conversion rate (won ÷
  (won + lost), null when nothing has closed yet), a top industry/insurance need/campaign source,
  and a transparent 0-100 opportunity score with a hover explanation, scored by the same
  additive-points-plus-explanation convention as the lead scoring engine (`scoreOpportunity()`
  in `src/lib/scoring.ts`, next to `scoreLead()` - renamed from the original `scoreHotspot()`
  once the industry opportunity dashboard below needed the same scoring, just over a different
  subject). Computed live from already-captured, consented
  leads on every page load - there is no `hotspot_snapshots` table or background refresh job yet,
  so "computed as of" means "as of this page load," not "last refreshed by a job." The synthetic
  seed script now also generates a `suburb` per lead for any future reseed, and the already-
  committed demo dataset was deterministically backfilled with one (derived from each lead's id,
  not randomised, so it is a stable one-time patch rather than a full reseed) so the suburb-level
  breakdown has real demo data to gate once the threshold is lowered.
- Industry opportunity dashboard completed: a `/dashboard/market-intelligence/industries` page
  grouping already-captured leads by industry, gated by the exact same admin-configurable
  minimum lead volume as the hotspot dashboard above (`application_settings.hotspot_min_lead_
  threshold`) - a deliberate reuse of one setting rather than inventing a second "industry
  minimum," since both are the same compliance control (don't show a breakdown thin enough to
  be identifiable), documented inline in `src/lib/industries.ts`. Each visible industry carries
  a lead volume, a growth rate and a conversion rate computed the same way as the hotspot
  dashboard's (both now shared from `src/lib/aggregation-utils.ts`, extracted out of
  `src/lib/hotspots.ts` so the two dashboards can't quietly drift apart), a renewal-urgency
  count ("N of M" leads with a captured renewal month whose next occurrence falls within 45
  days - `RENEWAL_URGENCY_WINDOW_DAYS` in `src/lib/constants.ts`, matching `scoreLead()`'s own
  45-day renewal-urgency threshold; shown as "no renewal dates captured yet" rather than a
  fake 0 of 0 when nobody in that industry has given one), its most-requested cover need, and
  the same transparent 0-100 `scoreOpportunity()` score with a hover explanation. An industry
  converting under 15% of its closed leads or declining more than 10% is flagged "Needs
  attention" with a plain-language reason, rather than left to blend into the table - the one
  piece of this dashboard that goes beyond pure reporting, and it is still just a flag for a
  human to review, never an automatic action. Three callout cards surface the highest-volume,
  fastest-growing, and best-converting industry at a glance, each honestly reading "Not enough
  data yet" instead of guessing when nothing qualifies. The Market Intelligence overview page
  links through to it the same way it links to Geographic Hotspots. Known limitation shared
  with the hotspot dashboard: growth rate compares the trailing 60 days to the 60 days before
  that relative to *now*, so as the committed synthetic seed data ages past that window without
  new leads, every industry's growth eventually reads as a decline and then settles at "no
  prior-period data" (null) - this is a property of static demo data outliving its own 120-day
  generation window, not a bug, and resolves itself automatically once real leads are flowing
  in continuously; `data/leads.json` was also deterministically backfilled with a `renewalMonth`
  per lead (same id-derived, non-randomised technique as the earlier `suburb` backfill) so the
  renewal-urgency column has real demo data to show.
- Financial-Year-End Campaign Planner completed: a `/dashboard/market-intelligence/fye-planner`
  page that groups already-captured leads by each business's own `financialYearEndMonth` -
  the brief is explicit not every business has a March year-end, so nothing here assumes a
  single national cycle. A 12-month calendar grid shows lead volume per month and highlights
  any month whose next occurrence falls within `FYE_PLANNING_WINDOW_DAYS` (90 days -
  intentionally wider than the industry dashboard's 45-day renewal-urgency window, since a
  year-end review is planned well ahead of time rather than reacted to). Selecting a month
  shows a results breakdown by sector and location plus its top insurance need and conversion
  rate ("track campaign results by month, sector, location, and insurance need" - brief
  section 8), computed from one shared leads fetch (`getFyePlannerData()` in
  `src/lib/dashboard-data.ts`) rather than one query per month. A platform admin, broker
  manager, or marketing analyst (`canManageCampaignPlanning()` in `src/lib/auth.ts` - the same
  three roles `src/mcp/campaign-tools.ts` already grants campaign-creation to) can create a
  lightweight campaign "plan" - a reminder/calendar entry only, never an outbound send itself
  (that heavier system - audience rules, content versions, Resend delivery - already exists
  separately for tenant-scoped broker campaigns) - and move it through planned/active/
  completed/cancelled, backed by a new `financial_year_calendars` table and two SECURITY
  DEFINER RPCs following the same lockdown pattern as the Data Source Registry (select-only for
  the authenticated role, every write re-checks the caller's role server-side). A platform
  admin or broker operator (`canUpdateLeadStatus()`, already used for the single-task form on a
  lead's profile) can bulk-create one ordinary broker follow-up task per eligible lead in the
  selected month - never do-not-contact, never already redacted - by re-running the exact same
  per-lead task-creation path (and, in Supabase mode, the exact same `create_lead_task` RPC
  with its own org-allocation check) once per lead, so a bulk batch can never create a task
  anywhere a broker couldn't already create one by hand. The Market Intelligence overview page
  links through to it the same way it links to Geographic Hotspots and Industry Opportunity.
- Data Source Registry completed: a dedicated `/dashboard/data-sources` page where a platform or
  compliance admin registers every source of business or contact information the platform uses -
  category restricted to the brief's allowed list (website forms, referral partners, approved
  events/webinars, approved CSV uploads, CRM imports, permissioned email campaigns, Google Ads/
  Search Console, organic analytics, approved directories/commercial providers, public aggregate
  statistics, manual broker entry - deliberately no scraping category), with legal basis, consent
  status, licence reference, retention period, approved use, data fields received, data quality
  rating, refresh frequency, and PII/market-intelligence-only flags all required or explicitly set
  at registration. A separate decision step (approve/reject/suspend/reinstate) is the only way to
  change a source's approval status, and a source cannot be marked allowed-for-marketing until it
  is approved (enforced by both a SECURITY DEFINER RPC and a database check constraint) - editing a
  source's governance fields never silently keeps an outdated approval or marketing permission
  alive. Every decision is appended to an audit-trail table (`data_source_approvals`) rather than
  overwriting history. The Compliance dashboard's former "Data source approvals" placeholder is now
  a real summary (pending/approved/rejected/suspended counts) linking to the full registry. This is
  the registry only - CSV import gating on it is still open, because no CSV import feature exists
  in the codebase yet to gate; a future importer should require `data_sources.approval_status =
  'approved'` for the source it reads from, the same way this registry's own RPCs already require
  every governance field to be supplied before a source exists at all.

## Compliance & Quality
- Compliance dashboard completed (MVP): consent coverage, leads without a valid consent record
  (the same five checks the public form enforces), Do Not Contact count, unassigned leads (no
  reserved/accepted/disputed allocation and not already in a terminal status), retention
  exceptions against a configurable `application_settings.lead_retention_days` threshold editable
  by a platform/compliance admin, and (since the opt-out/DSR workflow below) new opt-out request
  and open/overdue data subject request counts - all computed from real demo/Supabase data, gated
  to platform admins, compliance admins, and read-only for compliance auditors (reusing the
  existing is_platform_admin()/is_compliance_auditor() RLS helpers, so no new policies were needed
  beyond the settings table itself). Its "Data source approvals" widget is now a real summary
  (see the Data Source Registry item under Market Intelligence); its "Export activity" widget is
  now a real summary too, reading the audit log's own `export`-entity entries (see the Audit Log
  Viewer item below) and linking through to the full Audit Log page - no placeholder remains on
  this dashboard.
- Opt-out and data subject request workflows completed: a compliance-admin-only log of opt-out
  requests received outside a form submission (phone, email, WhatsApp, letter), where processing
  one sets the linked lead to Do Not Contact through the same update_lead_status() path the
  Kanban board and lead profile use; and a POPIA access/correction/deletion request log with a
  30-day due date, status progression (received -> verifying -> in progress -> completed/
  rejected), and, for a completed deletion request against a linked lead, an irreversible
  redaction of that lead's personal-identifying fields (name, email, mobile, business/trading
  name, website) with its own audit-log entry and activity-timeline entry. Both are deliberately
  separate from the existing broker-campaign-scoped marketing-suppression/unsubscribe mechanism
  (campaign-unsubscribe.ts), which only stops future campaign *sends* for one broker and has no
  concept of a formal request. Writes go through SECURITY DEFINER RPCs restricted to platform_
  admin/compliance_admin (broker operators and compliance auditors cannot create or resolve
  these), same lockdown pattern as lead_notes/lead_tasks/lead_activities.
- Two demo-data accuracy fixes completed: `scripts/generate-seed.mjs` now writes a matching, fully
  valid consent record (`data/consents.json`) for every synthetic lead it generates, so freshly
  seeded demo data shows a realistic consent-coverage figure instead of near-zero; and the main
  dashboard overview's "Unassigned" stat (`src/app/(dashboard)/dashboard/page.tsx`) now uses the
  same real, allocation-based definition of "assigned" the Compliance overview already used
  (`getActiveAllocationLeadIds()`/`isLeadUnassigned()`, extracted into `dashboard-data.ts` for both
  to share) instead of the cosmetic, free-text `Lead.assignedBroker` field - which is still shown
  as-is in the leads table and lead profile page as a display label, not a source of truth. A new
  "Assigned to a Broker" stat card was added alongside it for the same reason the request asked to
  "separate" the two: one real count for leads with no active allocation, one for leads with one.
- Audit Log Viewer completed: a `/dashboard/audit-log` page listing the platform's existing
  `audit_logs` table (nearly every mutation across the app already wrote to it - lead creation/
  edits, assignment, consent, marketing-permission, status, Do Not Contact, data source imports,
  and more) with filters by entity, action/actor text, and date range, gated to platform admins,
  compliance admins, and read-only for compliance auditors (`canViewCompliance()` - the Compliance
  dashboard's own gate), the same roles the brief's Phase 5 names for this deliverable. No new
  migration was needed: the base `audit_logs` table and its RLS (broad `select` for authenticated,
  plus the platform-admin/compliance-auditor/organisation-scoped policies already added for multi-
  broker tenancy) already covered the read path, so this is purely additive application code. A
  stricter `canManageCompliance()` check (platform admin/compliance admin only, not auditors) gates
  a "Export filtered CSV" button - the brief's own distinction between viewing compliance data and
  exporting it. The export re-derives and re-filters the entries server-side with the same filter
  criteria the client sent, rather than trusting whatever rows happen to be in the browser, so the
  CSV's own embedded metadata header (exported by, export date, filters applied, number of records,
  and a genuine audit-log reference - the id of the `export`-entity row the export itself just
  wrote) is trustworthy per brief section 12's export-reporting requirement, and the export action
  is itself an audited, timestamped `audit_logs` row like every other mutation. `src/lib/audit-
  log.ts` holds the filter and CSV logic as framework-free pure functions shared by the client's
  live in-browser filtering and the server's authoritative re-filtering, following the same pure-
  computation-module convention as `aggregation-utils.ts`/`hotspots.ts`/`industries.ts`/`fye-
  planner.ts`. Role-restricted, audited exports for the broader reporting suite below (leads by
  source/broker/industry/etc., with time-limited links) remain open - this item covers the audit
  log itself.
- Automated test suite completed: Vitest unit tests (`vitest.config.ts`, scoped to
  `src/**/*.test.ts` with a Node environment - no DOM or Next.js runtime, since route/page/
  component behaviour already belongs to the Playwright suite below, not here) against every
  pure computation module the platform's scoring, Market Intelligence, audit log, and
  compliance features are built on - `scoring.ts`, `aggregation-utils.ts`, `hotspots.ts`,
  `industries.ts`, `fye-planner.ts`, `lead-utils.ts`, `audit-log.ts` - plus the consultation
  form's Zod validation schema (every required-consent literal, the honeypot field, the
  business-vs-individual product/cover consistency rules). 106 tests across 8 files, wired into
  `.github/workflows/ci.yml` as its own step (`npm run test:unit`) between type-checking and the
  existing tenancy/campaign verification scripts, ahead of the production build and the
  Playwright end-to-end suite that was already in place. Known trade-off: vitest@5 (and its
  fixed `@vitest/mocker` advisory) requires Node >=22.12 at runtime, but CI and the documented
  local dev setup are pinned to Node 20.19 (a Next.js 16/React 19 compatibility decision outside
  this item's scope) - so this uses vitest@3.2.7 instead, a dev-only test-runner dependency never
  shipped to the production bundle, with one known moderate/critical advisory in its own mocking
  internals that would require a wider Node-version bump to clear. Separately and pre-existing,
  unrelated to this item: `npm audit` also flags a critical Next.js advisory (GHSA-vcvr-r3jv-pc5j,
  `next/og` ImageResponse) and a critical `sharp` advisory already present in the dependency tree
  before this change - both are production dependencies and worth their own deliberate upgrade
  decision, not bundled into this test-infrastructure item.
- Accessibility review and security review checklist.
- Demo data reset process and seeded demo accounts per role.

## Reporting
- Full reporting suite: leads by source/broker/industry/location/campaign/category/score,
  funnel conversion rates, response time, lead ageing, lost-lead reasons, FYE campaign
  performance, hotspot conversion performance.

## Campaign Orchestration MCP
- Ingest signed Resend delivery, bounce, complaint, open, and click webhooks into immutable events.
- Add scheduled-job execution and per-tenant daily/monthly delivery quotas beyond the bounded MCP batch.
- Add visual campaign authoring, approval, version comparison, and recipient-exclusion drill-down.
