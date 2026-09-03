# Phase 2+ Backlog — InsureLead Intelligence

Scope not included in the working functional prototype, grouped by the phased build plan.
Priced in the accompanying quotation.

## Foundation & Data Layer
- Production-pilot foundation completed: Supabase persistence for leads, consent, approved buyers,
  allocations and audit logs; cookie-based dashboard authentication; RLS; and atomic consent-aware
  capture/allocation functions.
- Expand the Supabase schema for the full build: users, user_roles, broker_profiles,
  teams, leads, lead_contacts, lead_insurance_needs, lead_consents, lead_assignments,
  lead_activities, lead_notes, lead_tasks, lead_scores, lead_sources, campaigns,
  campaign_attribution, campaign_metrics, data_sources, data_source_approvals, market_signals,
  hotspot_snapshots, industry_snapshots, financial_year_calendars, opt_out_requests,
  data_subject_requests, audit_logs, application_settings.
- Extend Row Level Security policies to every future sensitive table.
- Expand Supabase Auth role-based access control beyond the pilot roles (Super Admin, Compliance Admin, Broker
  Manager, Broker, Marketing Analyst).

## Lead Capture Hardening
- Production CAPTCHA integration and durable rate limiting (Upstash/Redis) in front of the
  public form.
- Secure internal broker/lead-queue notifications (email or queue-based).
- Configurable legal-text fields editable by Compliance Admin (privacy notice, consent wording,
  marketing wording, FSP disclosures, terms, retention policy) with version history.

## Broker Workflow
- Kanban pipeline across all 13 lead statuses, with drag-and-drop reassignment.
- Notes, tasks, call/email/meeting logging, and follow-up reminders on the lead profile.
- Full activity timeline and loss-reason capture.
- Do Not Contact workflow enforcement across all outreach surfaces.

## Buyer Commerce
- Buyer self-service portal for accepting or releasing allocated leads through narrow, audited
  database functions.
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
- Compliance dashboard: consent coverage, opt-outs, retention exceptions, unassigned leads,
  leads without valid consent, pending data source approvals, export activity, data subject
  requests.
- Opt-out and data subject request workflows (access, correction, deletion).
- Role-restricted, audited CSV/report exports with time-limited links.
- Automated test suite: Vitest (unit) and Playwright (end-to-end).
- Accessibility review and security review checklist.
- Demo data reset process and seeded demo accounts per role.

## Reporting
- Full reporting suite: leads by source/broker/industry/location/campaign/category/score,
  funnel conversion rates, response time, lead ageing, lost-lead reasons, FYE campaign
  performance, hotspot conversion performance.
