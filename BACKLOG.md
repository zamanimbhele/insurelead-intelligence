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
- Platform administration UI for invitations, role changes, and organisation approval completed
  (sending-domain verification partially - see below). The schema already had everything this
  needed, designed but never wired up: `organisations.onboarding_status` already supported
  `pending`/`in_review`/`approved`/`rejected` and `profiles.member_status` already supported
  `invited` (multi-broker tenancy), but nothing ever wrote an `invited` profile, and the only
  documented way to provision a broker was a platform admin manually running two example SQL
  scripts by hand (`docs/BROKER_TENANCY_SETUP.md`). Worse, a real and previously undetected dead
  end: self-service sign-up (`/signup`) already created a genuine Supabase auth user with
  brokerage/role metadata, but nothing ever turned that into a `profiles` row -
  `getDashboardIdentity()` already had a `reason: "profile_missing"` branch and `/access-denied`
  already said "ask a platform administrator to complete your access setup", but there was no way
  for an admin to ever discover that a signup had happened at all; the account was simply stuck
  forever. Closed with a new migration (`202610100001_platform_admin_onboarding.sql`):
  `handle_new_user()`, a trigger on `auth.users`, now creates a pending organisation and an
  invited profile automatically at signup time, and three new platform-admin-only SECURITY
  DEFINER RPCs - `review_broker_organisation()` (approve/reject), `update_profile_membership()`
  (role and invited/active/suspended status changes, with a self-lockout guard preventing an
  admin from changing their own role/status), and `review_sending_identity()` (verified/disabled)
  - let a platform admin act on it, each writing its own `audit_logs` entry following this
  codebase's established RPC pattern exactly. `/dashboard/brokers` (Broker Directory, already
  platform-admin/compliance-auditor gated) now shows an approve/reject panel on any pending
  organisation, an editable team-members roster per organisation (role + status, read-only for
  compliance auditors), and verify/disable actions on each sending identity -
  `BrokerAdminControls.tsx` holds the three client components, each calling its own new `/api/
  admin/...` route. A deliberate security hardening, not an afterthought: `raw_user_meta_data` on
  a Supabase auth user is client-supplied at signup time (a direct call to Supabase's own signup
  endpoint can set it to anything, bypassing this app's own form), so `handle_new_user()` never
  trusts it for privilege - the new profile is always created `invited` (never `active`) and
  `requested_role` is clamped to the three broker-side roles only, defaulting to `broker_admin`;
  a spoofed `"platform_admin"` in the metadata can still only ever produce an invited,
  access-denied broker-role profile requiring a real platform admin's explicit, re-validated
  review. Demo mode is unaffected and unchanged (per its own already-documented limitation, it has
  no tenancy/allocation model to manage); `getDashboardBrokerDirectory()` returns an empty
  `members` array there rather than attempting anything.
  Sending-domain verification is only partially done: the admin review action (mark an existing
  identity verified/disabled, a manual DNS-checked attestation, not an automated Resend API call)
  works, but there was and still is no broker-side way to *add* a sending identity from the
  dashboard at all - today that only happens via the same manual SQL scripts used for broker
  provisioning - so this review action is only useful once an identity already exists; a
  broker-side creation form is explicitly open future work, documented in
  `docs/BROKER_TENANCY_SETUP.md` rather than silently left out. Also explicitly out of scope at
  the time: inviting an additional team member into an *already-approved* organisation (closed by
  the next item below). This migration could not be
  executed against a real Postgres instance from this session (no `supabase`/`psql` CLI
  available, consistent with every other migration in this series being written for the user's
  own `npx supabase db push`) - verified instead by a careful manual read-through plus a
  balanced-syntax check (function count, matching `begin`/`end`, matched `$$` delimiters, balanced
  parentheses) and by closely mirroring the exact structure of this codebase's many already-
  working RPCs (`log_lead_interaction()`, `create_lead_task()`, `respond_to_lead_allocation()`).
- Broker-side self-service team invitations completed: the gap flagged above - a colleague joining
  an already-approved organisation had no path except another self-signup, which `handle_new_user()`
  turns into a *second*, duplicate `pending` organisation rather than joining the existing one - is
  closed. `/dashboard/broker-profile` ("Invite a team member", `broker_admin` only via
  `canInviteTeamMember()`) collects an email, optional display name, and role, and posts to
  `/api/broker-team/invite`. That route is the first place in this codebase to call the Supabase
  Admin API rather than only the caller's own session client: `inviteSupabaseAuthUser()`
  (`src/lib/supabase/admin.ts`) uses the existing service-role admin client
  (`createSupabaseAdminClient()`, already used for the public lead-capture path) to create a real
  auth user and send Supabase's own invite email, deliberately never setting `brokerage_name` in
  its metadata so `handle_new_user()` correctly leaves it alone. The resulting user id is then
  attached to the *inviter's own* organisation by a new `invite_broker_team_member()` SECURITY
  DEFINER RPC (`supabase/migrations/202610110002_broker_team_invitations.sql`), which re-checks the
  caller is an active `broker_admin`, resolves the organisation from the caller's own profile
  server-side (never a client-supplied id), rejects a role outside the three broker roles, rejects a
  target that already has a profile (defense in depth - the Admin API itself already refuses to
  invite an address that is already registered, so this should be unreachable in practice), and
  writes its own `audit_logs` entry (`profile_invited`). Known, explicitly accepted limitation: an
  email that already self-signed-up and is stuck in its own duplicate pending organisation still
  cannot be invited this way (Supabase refuses to invite an already-registered address) - an
  account-merge flow is a reasonable further refinement, not attempted here. This is also the only
  Supabase-mode-only broker self-service action added so far with no demo-mode equivalent at all
  (unlike sending identities or FYE plans, which have one): inviting someone requires creating a
  real, separately-authenticating account, which has no meaningful analogue in demo mode's
  single-shared-cookie identity model - the form and API route both refuse outright in demo mode
  with the same pattern the sending-identity review action already established
  ("Team invitations require Supabase mode"). The new RPC could not be executed against a real
  Postgres instance from this session either, for the same reason as every other migration in this
  series - verified instead by the same manual read-through and balanced-syntax check. A new
  Playwright spec (`e2e/broker-team-invite.spec.ts`) covers what demo mode can actually verify: the
  role gate (visible to Broker Manager, not to the default Super Admin or an ordinary Broker) and
  that the API route correctly refuses to run in demo mode rather than silently doing nothing. This
  spec was actually run, not just lint/type-checked: this environment's device shell can't fit a
  `next build`+Playwright run in its per-call time budget, so it was verified instead by cloning the
  pushed branch into a separate scratch checkout and running the full suite there (`npm run build`,
  then `npx playwright test` against the preinstalled Chromium). The first version of this spec
  failed - genuinely, against real CI too (PR #23 came back 2/3 checks, the Playwright step red):
  `selectOption("broker_admin")` immediately followed by `page.goto()` to a different page races
  ahead of the demo role switcher's own server-action redirect (DemoRoleSwitcher.tsx auto-submits
  on change; the redirect target is always `/dashboard`, the same route the test was already on, so
  an `expect(page).toHaveURL(...)` guard is vacuously true and never actually waits for it) - the
  interrupted redirect meant the `demo_role` cookie was never applied, so the next page load still
  showed the previous role. Fixed by waiting on a real, state-dependent signal instead - the
  sidebar's own identity line showing the new demo account's name - before navigating on; all 54
  specs in the full suite pass against this branch after the fix. Every other Playwright spec this
  series of migrations/features has written (DNC enforcement, sending-identity creation) was
  authored under the same unverified lint/type-check-only process and has not yet been run against
  real CI - this is now a known risk worth re-checking, not an assumption to keep repeating.

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
  This item's Playwright e2e coverage (`e2e/legal-content.spec.ts`) could not be executed inside
  this session's own remote device-bridge shell (a notably slow filesystem there - Next.js's own
  dev server flags it - meant the Playwright-managed web server could not reliably come up within
  that shell's per-command time budget), so it went out for its first real run in CI instead.
  That run caught a genuine bug: a document's starting version (the seeded default) was only ever
  synthesized on the fly for display in `getLegalTextDocumentVersions()`, never actually written
  to `legal_text_document_versions` - so its very first edit silently and permanently dropped that
  starting version from history, which is exactly the "a prior version is never lost" guarantee
  this feature exists to provide. The Supabase path never had this bug (the migration seeds the
  starting version into `legal_text_document_versions` directly at table-creation time); only the
  demo-mode equivalent in `demo-store.ts` lazily deferred that seeding and then never did it.
  Fixed in `updateLegalTextDocument()`: on a document's first-ever edit, its pre-edit version is
  now written to history before being superseded, exactly once per document. The e2e test itself
  was also hardening against a related fragility CI's retry surfaced: it had assumed a document's
  starting version is always "v1", which breaks the moment the same demo-store.json has already
  been edited once (by an earlier local run, or by Playwright's own retry of a failed attempt) -
  every other e2e test in this suite avoids the equivalent problem by giving freshly-created
  records a `Date.now()`-unique name, which isn't available for a fixed singleton document, so
  this test now reads its actual starting version from the page instead of hardcoding one.

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
- Demo accounts and demo data reset completed: 6 seeded, 100% synthetic demo accounts - one per
  role the brief defines in section 4 (Super Admin, Compliance Admin, Broker Manager, Broker,
  Marketing Analyst), plus the read-only Compliance Auditor role already present in this codebase's
  own AUDIT_ROLES - defined once in `DEMO_ROLE_ACCOUNTS` (`src/lib/constants.ts`) and selectable
  from a "Viewing as" control in the dashboard sidebar (`DemoRoleSwitcher.tsx`), backed by a
  `demo_role` cookie `getDashboardIdentity()` (`src/lib/auth.ts`) reads in demo mode and
  `setDemoRole()` (`src/app/(dashboard)/dashboard/actions.ts`) writes.
  This surfaced, and fixes, a real gap rather than just adding UI: `isPlatformAdmin()` previously
  returned `true` for every demo identity unconditionally (`identity.mode === "demo" || ...`), so
  every demo account - regardless of which role it claimed - was already a platform admin in every
  permission check (`canViewCompliance()`, `canManageCompliance()`, `canUpdateLeadStatus()`,
  `canManageCampaignPlanning()`, and the brokers/marketplace page gates all call through it). A role
  switcher built on top of that bypass would have been cosmetic - every account would have looked
  identical regardless of which was selected. Fixed by deleting the bypass: demo mode now goes
  through the exact same `ADMIN_ROLES`/`AUDIT_ROLES`/`BROKER_ROLES` checks Supabase mode already
  uses, since all 6 DEMO_ROLE_ACCOUNTS role keys are drawn from those same real role strings (never
  a separate `"demo_"`-prefixed literal). The default account is still Super Admin
  (`platform_admin`, `DEFAULT_DEMO_ROLE`), so every pre-existing e2e test - several of which have
  their own code comments stating the "demo mode is always a platform admin" assumption, updated in
  this change to describe the new default-role behaviour precisely - keeps passing unchanged; the
  difference only appears once a different role is actually selected. Verified directly (not just by
  `tsc`/`eslint`, which this is invisible to) with an isolated script building `DashboardIdentity`
  objects for all 6 roles and tabulating every `auth.ts` permission-check function against each -
  confirming, for example, that a Broker Manager can respond to allocations and update lead status
  but cannot view Compliance, and a Marketing Analyst can manage campaign planning but cannot update
  lead status or view Compliance, matching brief section 4's role matrix.
  Known, explicitly documented limitation: demo mode has no allocation/organisation-tenancy model at
  all (that machinery - `lead_assignments`, organisation-scoped RLS - is Supabase-only), so unlike
  Supabase mode a demo Broker or Broker Manager account is not restricted to a subset of leads by
  data; only navigation and edit-control gating differs per role in demo mode. Lead-level scoping for
  demo mode was out of scope for this item.
  A platform-admin-only, demo-mode-only "Reset demo data" action (`/dashboard/demo-tools`) was added
  alongside the role switcher, since both serve the same "explore the prototype from a clean slate"
  need. `resetDemoData()` (`src/lib/demo-store.ts`) regenerates leads and consents with a fresh
  synthetic dataset and clears notes, tasks, activity timelines, opt-out requests, data subject
  requests, the Data Source Registry, FYE campaign plans, legal text content/history, and application
  settings back to the exact same defaults each table's own getter already falls back to when its
  file is missing - deliberately not hand-constructing a second copy of those defaults. It is
  disabled entirely outside demo mode (both by the page itself and, independently, inside the server
  action), since real pilot data must never be reset from the running application, and it
  deliberately does not touch the separate buyer-marketplace/campaign-orchestration demo tables
  (`allocations.json`, `buyers.json`, `campaigns.json` and related files) - a different tenancy layer
  with its own lifecycle, out of scope for this item. The confirmation phrase ("type RESET") is
  re-checked server-side, not trusted from the form's client-side pattern/disabled-button gate alone.
  Verified with an isolated script that seeds a temp workspace with deliberately "dirty" state
  (stale leads, notes, an edited legal-text document, a non-default settings override, old audit-log
  entries) and confirms the reset clears every one of them and leaves exactly one new, accurate audit
  log entry behind.
  In service of this item, `scripts/generate-seed.mjs`'s generator logic was extracted into
  `src/lib/demo-seed-data.ts` (a plain TypeScript module, no file I/O) so the CLI command
  (`npm run seed:demo`, replacing the previously undocumented direct `node scripts/generate-seed.mjs`
  invocation - the script now needs `node --import tsx` to import that TypeScript module, the same
  way `scripts/verify-tenancy.ts` and `scripts/verify-campaigns.ts` already run) and the in-app reset
  action share one generator and can never quietly drift apart - the same reasoning
  `aggregation-utils.ts` already follows for the hotspot/industry dashboards. Two small, genuine
  fixes came out of that extraction: the generator now reuses this codebase's own canonical
  `PROVINCES`/`INDUSTRIES`/etc. constants (`src/lib/constants.ts`) instead of a separately maintained,
  already-drifted copy (the prior literal list covered only 6 of the 9 real provinces and a shorter
  industry list), and it now generates a lead's `renewalMonth` directly (previously missing from the
  generator entirely - a one-off script had separately, deterministically backfilled the already-
  committed `data/leads.json` with one instead, per the Industry Opportunity dashboard's own backlog
  entry above - so every future seed or reset has it from the start, not just the one already-
  committed dataset).

## Reporting
- Full reporting suite: leads by source/broker/industry/location/campaign/category/score,
  funnel conversion rates, response time, lead ageing, lost-lead reasons, FYE campaign
  performance, hotspot conversion performance.

## Campaign Orchestration MCP
- Ingest signed Resend delivery, bounce, complaint, open, and click webhooks into immutable events.
- Add scheduled-job execution and per-tenant daily/monthly delivery quotas beyond the bounded MCP batch.
- Add visual campaign authoring, approval, version comparison, and recipient-exclusion drill-down.
