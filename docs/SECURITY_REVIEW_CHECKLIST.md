# Security Review Checklist — InsureLead Intelligence

Phase 5 deliverable (project brief section 14/15): a review against the brief's own
section 11 security requirements list, plus the compliance dashboard's own checklist
(section 11, last paragraph). Each line states what was actually found in the codebase
(file/function named) and, where relevant, what remains open - this is a status checklist
against evidence, not a claim of blanket completion. One real gap was found and fixed in
this same pass (missing security headers); everything else below reports what already
existed, confirmed by reading the code rather than assumed from feature names.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Role-based access control | ✅ Done | `src/lib/auth.ts` - `ADMIN_ROLES`/`AUDIT_ROLES`/`BROKER_ROLES`/`BROKER_OPERATOR_ROLES`/`CAMPAIGN_PLANNING_ROLES` and the `isPlatformAdmin()`/`canViewCompliance()`/`canManageCompliance()`/`canUpdateLeadStatus()`/`canManageCampaignPlanning()` permission functions, applied consistently across every dashboard page and API route. |
| 2 | Supabase Row Level Security | ✅ Done | Every sensitive table (`leads`, `lead_notes`, `lead_tasks`, `lead_activities`, `audit_logs`, `data_sources`, `financial_year_calendars`, `opt_out_requests`, `data_subject_requests`, `legal_text_documents`, …) has RLS enabled in its migration, select-only for the authenticated role, writes routed through SECURITY DEFINER RPCs. |
| 3 | Server-side authorisation checks | ✅ Done | Every mutating Supabase RPC re-checks `acting_profile.role` and (for broker operators) `lead_allocations` membership itself - never trusts a client-supplied role. Every demo-mode API route checks `getDashboardIdentity()`/the matching `can*()` function before calling into `demo-store.ts`. |
| 4 | Input validation with Zod | ✅ Done | `consultationSchema.ts` validates the full public lead form (25 unit tests cover it - `src/lib/validation/consultationSchema.test.ts`); every API route under `src/app/api/` parses its body with a `z.object(...)` schema before touching data. |
| 5 | CSRF-aware form handling | ✅ Covered by framework | Dashboard mutations go through Next.js Server Actions (`"use server"` functions, e.g. `src/app/(dashboard)/dashboard/actions.ts`), which carry built-in Origin-header CSRF protection since Next.js 14. The public lead-capture and dashboard API routes are same-origin `fetch()` calls from the app's own pages with `SameSite=Lax` cookies (see `setDemoRole()`'s cookie options), which blocks cross-site form submission from reaching them with session credentials. No separate CSRF-token library is in place; if the app is ever embedded or called from a different origin, this should be revisited. |
| 6 | Rate limiting on public forms | ✅ Done | `checkLeadSubmissionRateLimit()` (`src/lib/supabase/data.ts`), a durable HMAC-keyed Supabase counter per the Production Pilot Hardening item in `BACKLOG.md`, called at the top of `POST /api/leads` before any write; returns `429` with `Retry-After`. |
| 7 | CAPTCHA-ready architecture | ✅ Done | Cloudflare Turnstile integration (`TurnstileWidget.tsx`), wired into `ConsultationForm.tsx`'s final step and re-armed on submit failure (`captchaResetSignal`); the submit button is disabled until a token is present when a site key is configured. |
| 8 | Honeypot spam field | ✅ Done, and verified accessible | `website_url` field in `StepConsent.tsx` - hidden via `className="hidden" aria-hidden="true"`, additionally `tabIndex={-1}` and `autoComplete="off"` so it's never reachable by keyboard either (see `ACCESSIBILITY_REVIEW.md`). |
| 9 | Duplicate submission detection | ✅ Done | `hasRuntimeDuplicate(email, businessName)` checked in `POST /api/leads` and fed into `scoreLead()` as a scoring penalty (`isDuplicate`, `src/lib/scoring.ts`) rather than silently rejected - a human still reviews it, per the brief's "always allow human review" rule for scoring. |
| 10 | Secure environment variables | ✅ Done | `.env.example` is the only env file tracked in git (`git ls-files` confirms no `.env`/`.env.local` is committed); `.gitignore` excludes both. |
| 11 | No secrets committed to Git | ✅ Confirmed, no secrets found | Same check as above - no `.env*` file other than `.env.example` is tracked. Not a guarantee against a secret pasted directly into a committed file; worth a `git log -p --all \| grep`-style sweep or a secret-scanning CI step as a future hardening item (not yet in `.github/workflows/ci.yml`). |
| 12 | Security headers | ⚠️ Was missing - fixed in this pass | `next.config.mjs` had no `headers()` function at all. Added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a conservative `Permissions-Policy`, applied to every route. **Deliberately not included: a Content-Security-Policy.** A safe CSP has to enumerate every real script/style/connect-src origin the deployed app uses (Supabase, Turnstile, Resend-linked email, any analytics) - guessing one here risks silently breaking the app in production, which is worse than no CSP; see "Open items" below. |
| 13 | Error-message sanitisation | ✅ Done | Every mutating API route (`src/app/api/leads/[id]/interactions/route.ts`, `.../tasks/route.ts`, and 8 others) uses a `safeErrors` allow-list: only specific known, non-sensitive validation-error strings thrown by the underlying `demo-store.ts`/Supabase-RPC functions are ever returned to the client; anything else falls back to a generic message, so a raw database or stack-trace error is never leaked. |
| 14 | PII redaction from logs | ✅ Confirmed, nothing to redact | No `console.log`/`console.error`/`console.warn` call exists anywhere under `src/app/api/` or `src/lib/` that logs request bodies or lead data - there's simply no ambient server-side logging of lead PII to redact in the first place. If structured logging is added later (for production observability), it needs this same discipline applied deliberately. |
| 15 | Audit logging | ✅ Done | `audit_logs` table written on lead creation/edits, assignment changes, consent changes, marketing-permission changes, status/Do Not Contact changes, data-source imports, exports, and data-deletion requests - see the Audit Log Viewer item in `BACKLOG.md`. One real bug found and fixed in an earlier pass is documented there: `entityId` must be a `uuid`, and three call sites were passing natural-language strings, causing a silent false-failure (the real write succeeded, the audit insert then threw, and the route reported failure even though it had worked) - fixed centrally in `appendSupabaseAuditLog()`. |
| 16 | Restricted data exports | ✅ Done | The Audit Log Viewer's CSV export is gated by `canManageCompliance()` (platform/compliance admin only, stricter than the page's own view gate), re-derives and re-filters server-side rather than trusting the browser's current rows, and is itself an audited `export`-entity `audit_logs` row. |
| 17 | CSV export permissions for authorised roles only | ✅ Done | Same gate as above; the broader reporting suite (leads by source/broker/industry/etc.) named in brief section 12 is still open (see `BACKLOG.md`'s Reporting section) and will need the identical pattern once built. |
| 18 | Time-limited export links | ❌ Open | The current export is a direct, synchronous, authenticated-session CSV download - there is no generated, expiring, shareable link mechanism. Only relevant once exports need to be handed to someone outside an authenticated session; tracked as open rather than silently skipped. |
| 19 | Soft delete for leads, hard-delete workflow for approved deletion requests | ✅ Done | `Lead.deletedAt` (`src/lib/types.ts`) is the soft-delete marker; a *completed* data subject deletion request irreversibly redacts (not deletes) a lead's PII fields (name, email, mobile, business/trading name, website) via its own audited RPC - "hard delete" here means permanent redaction of identifying fields, not row deletion, since the lead and its history must remain for audit purposes. |
| 20 | Strong password and session management via Supabase Auth | ✅ Delegated to Supabase, not reimplemented | Sign-in (`src/app/(auth)/login/actions.ts`) and sign-up go through `@supabase/ssr`'s cookie-based session handling rather than any custom session/token code - correctly leaves password hashing, session rotation, and cookie security to Supabase Auth rather than a bespoke (and more error-prone) implementation. |

## Open items (tracked, not silently skipped)

- **Content-Security-Policy** - needs the real deployment's script/style/connect origins
  enumerated before a safe policy can be written (see row 12 above).
- **Time-limited export links** (row 18) - only needed once an export must be shared
  outside an authenticated session; the broader reporting suite this would attach to is
  itself still open in `BACKLOG.md`.
- **Secret-scanning in CI** - no committed secret was found, but there's no automated
  guard preventing one from being committed in the future; worth a CI step (e.g.
  gitleaks/truffleHog) alongside the existing `tsc`/`eslint`/`test:unit`/`test:tenancy`/
  `test:campaigns` pipeline in `.github/workflows/ci.yml`.
- **CSV import gating** - already called out in the Data Source Registry's own `BACKLOG.md`
  entry: no CSV import feature exists yet to gate, but when one is built it must require
  `data_sources.approval_status = 'approved'` for the source it reads from, the same way
  the registry's own RPCs already require every governance field before a source can
  exist at all.

## How this review was done

Each row above was verified by reading the actual implementation named in its evidence
column - grepping for the relevant function/table/pattern and opening the file, not
inferred from a feature's name in `BACKLOG.md`. Rows marked "Open" or with a caveat are
real, current gaps, not hedging. This is a code-level review, not a penetration test or a
dependency vulnerability scan; `BACKLOG.md`'s Automated Test Suite entry already separately
documents a known `npm audit` finding (a critical Next.js `next/og` advisory and a critical
`sharp` advisory, both pre-existing production dependencies) that is a deliberate, separate
upgrade decision outside this checklist's scope.
