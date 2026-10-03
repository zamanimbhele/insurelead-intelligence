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
- Configurable legal-text fields editable by Compliance Admin (privacy notice, consent wording,
  marketing wording, FSP disclosures, terms, retention policy) with version history.

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
- Geographic hotspot dashboard (province → municipality → suburb) with opportunity score, growth
  rate, conversion rate, and configurable minimum-volume threshold.
- Industry opportunity dashboard (highest-volume, fastest-growing, best-converting, renewal
  urgency).
- Financial-year-end campaign planner: filter by FYE month, campaign calendar, broker follow-up
  task lists, results tracking by month/sector/location/need.
- Data Source Registry with governance fields (legal basis, consent status, licence reference,
  retention period, approved use) and CSV import gated on source/legal-basis selection.

## Compliance & Quality
- Compliance dashboard completed (MVP): consent coverage, leads without a valid consent record
  (the same five checks the public form enforces), Do Not Contact count, unassigned leads (no
  reserved/accepted/disputed allocation and not already in a terminal status), retention
  exceptions against a configurable `application_settings.lead_retention_days` threshold editable
  by a platform/compliance admin, and (since the opt-out/DSR workflow below) new opt-out request
  and open/overdue data subject request counts - all computed from real demo/Supabase data, gated
  to platform admins, compliance admins, and read-only for compliance auditors (reusing the
  existing is_platform_admin()/is_compliance_auditor() RLS helpers, so no new policies were needed
  beyond the settings table itself). Data-source-approval and export-activity widgets remain
  explicit "not yet available" placeholders rather than fabricated data - they need the two
  backlog items below built first.
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
- Role-restricted, audited CSV/report exports with time-limited links.
- Automated test suite: Vitest (unit) and Playwright (end-to-end).
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
