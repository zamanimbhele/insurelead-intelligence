# Accessibility Review — InsureLead Intelligence

Phase 5 deliverable (project brief section 14): an accessibility review of the public
lead-capture site and the internal broker dashboard, covering the primary layouts, the
multi-step consultation form, data tables, and navigation. This is a manual code-level
review against WCAG 2.1 AA, not an automated audit-tool report (no headless browser or
axe-core run was possible inside this session's own remote shell - see the "How this
review was done" note at the end, the same constraint already documented against the
Playwright e2e suite in `BACKLOG.md`). Every issue below was read directly from the
relevant component's source and, where listed as "Fixed", addressed in this same pass.

## Fixed in this pass

1. **No way to reach dashboard navigation on mobile/tablet.** The dashboard sidebar
   (`<aside>` in `DashboardLayout`) was `hidden ... lg:flex` - entirely absent below the
   `lg` breakpoint - and the mobile header row had no menu toggle at all, only a title and
   an "Exit" link. Every nav item (Leads, Campaigns, Compliance, Market Intelligence, …)
   was unreachable on a phone or tablet. This is not just an accessibility nicety; the
   brief's own section 3 and section 13 require "Mobile-first responsive design." Fixed
   with a new `DashboardMobileNav` client component (`src/components/dashboard/
   DashboardMobileNav.tsx`) that renders a labelled, `aria-expanded`/`aria-controls`
   toggle button and a full-width drawer reusing the exact same nav links the desktop
   sidebar renders (rendered once in the server layout, passed down as `children`, so the
   two can never drift apart).
2. **Orphaned `label[for]` references on three option-group fields.** `Field`
   (`src/components/forms/FormField.tsx`) renders `<label htmlFor={htmlFor}>`, which only
   works when exactly one control in the DOM has that id. Three usages pointed a label at
   an id nothing had - "Who needs insurance?" (the applicant-type radio pair), "Insurance
   products of interest", and "Business cover areas" (both checkbox groups) in the
   consultation form - so assistive tech had no programmatic link between the group's name
   and its controls (WCAG 1.3.1). Added `FieldGroup`, a `<fieldset>`/`<legend>` variant of
   `Field` (the semantically correct native grouping element for exactly this case), and
   switched all three to it.
3. **No skip-to-main-content link** on either the public site or the dashboard - a
   keyboard user had to tab through the full header/sidebar nav on every single page
   before reaching page content. Added a visually-hidden-until-focused skip link as the
   first focusable element in both `(site)/layout.tsx` and the dashboard layout, pointing
   at a new `id="main-content"` on each `<main>` landmark (the dashboard's content wrapper
   was a plain `<div>` with no landmark role at all - now a real `<main>`).
4. **No feedback on step change in the consultation form.** Moving between the 4 wizard
   steps (`ConsultationForm.tsx`) changed the visible heading but left focus wherever it
   was (typically the "Continue" button) and gave no programmatic signal that the page
   content had changed - a screen reader user gets nothing. Added: focus moves to the new
   step's heading on every step change (`stepHeadingRef` + `useEffect` keyed on `step`); a
   visually-hidden `role="status"` announcing "Step X of Y: `<label>`"; and `aria-current=
   "step"` on the current step's indicator circle.
5. **Submission/validation errors not announced.** The consultation form's top-level
   submit error, and `FormField`'s per-field error (shared by every form in the app), had
   no `role="alert"`, so a screen reader user filling the form wouldn't hear about a
   failure unless they happened to tab past the text afterward. Added `role="alert"` to
   both, plus the login and signup pages' error banners and `role="status"` on login's
   success banner - matching the `role="alert"` convention already used throughout the
   dashboard (`LeadActivityPanel.tsx`, `LeadPipelineCard`, the Kanban board's error state).
6. **Table headers without `scope`.** Every data table in the app (`LeadsTable`,
   `AuditLogViewer`, `HotspotDashboard`, `IndustryOpportunityDashboard`, the demo accounts
   table) rendered `<th>` cells with no `scope="col"`. Most modern screen readers infer
   this for simple one-row-header tables, but it isn't guaranteed and costs nothing to be
   explicit about - added to all five.
7. **Ambiguous navigation landmarks and incomplete disclosure state on the public site
   header.** The mobile menu toggle had an `aria-label` but no `aria-expanded`/`aria-
   controls`, and the desktop/mobile `<nav>` elements were both unlabelled (two regions
   both just announced as "navigation"). Added `aria-expanded`, `aria-controls`, and
   `aria-label="Primary"`/`"Mobile"` respectively.
8. **Missing security headers** - see `SECURITY_REVIEW_CHECKLIST.md`; while unrelated to
   accessibility, this was found and fixed in the same pass (`next.config.mjs`).

## Reviewed and already correct — no change needed

- **Kanban board** (`LeadKanbanBoard.tsx`): drag-and-drop already has a fully
  keyboard-accessible alternative - a `sr-only`-labelled "Move to" `<select>` on every
  card - so no lead is ever reachable only via mouse drag.
- **Score and status badges** (`ScoreBadge.tsx`): colour is never the only signal - every
  badge pairs its colour with a text label (`"Hot · 82"`, `"Won"`, `"Lost"`), satisfying
  WCAG 1.4.1 (Use of Color).
- **Honeypot spam field** (`StepConsent.tsx`): correctly hidden from assistive tech
  (`className="hidden" aria-hidden="true"`) and from keyboard tab order (`tabIndex={-1}`),
  not just visually hidden via CSS alone - a real screen-reader and keyboard trap was
  avoided here already.
- **Individual form labels**: every plain `<input>`/`<select>`/`<textarea>` in the
  consultation form, and every checkbox in `StepConsent.tsx`, is either wrapped in an
  implicit `<label>` or given a matching `id`/`htmlFor` pair - confirmed by reading every
  step component, not just spot-checked.
- **`<html lang="en-ZA">`** is set in the root layout; no global `outline: none` focus
  reset exists in `globals.css`; the shared `Button`/`LinkButton` components already use
  `focus-visible:ring-2` for a clearly visible keyboard focus indicator.

## Known gaps, documented but not fixed in this pass

These are real, but lower-severity, broader-surface-area, or dependent on a visual
re-render to safely verify (none of which this session's remote shell can do reliably -
see the note below), so they're recorded here as a prioritised follow-up rather than
risked as an unverified blind change:

- **`text-slate-400` fails WCAG AA contrast for body text.** Tailwind's default
  `slate-400` (`#94a3b8`) on a white background measures roughly 2.56:1, well under the
  4.5:1 AA threshold for normal text. It's used throughout the app for meaningful
  secondary content - empty-state copy ("No open follow-up tasks."), task due-dates and
  assignees, the "(optional)" field-label suffix - not just decorative placeholder text.
  This is a single-token, app-wide fix (swap to `slate-500`/`slate-600` wherever the text
  conveys information) but touches dozens of files; it needs a real rendered pass to
  confirm nothing looks visually broken afterward, which this session couldn't do. **Next
  step: grep every `text-slate-400` usage, reclassify each as decorative vs. informational,
  and bump the informational ones - verify with a real browser, not just a diff.**
- **No `aria-current="page"` on the active dashboard nav link.** The dashboard layout is a
  Server Component with no access to the current pathname without adding Next.js
  middleware to inject it as a request header (or converting significant parts of the
  layout to a Client Component). Worth doing, but a larger structural change than the
  scope of this pass; both the desktop sidebar and the new mobile drawer should get it
  together once that plumbing exists.
- **Focus-ring thickness inconsistency.** The shared `Button`/`LinkButton` use
  `focus-visible:ring-2` (clearly visible, keyboard-only). Many hand-rolled `<button>`/
  `<input>`/`<select>` elements scattered through dashboard components (for example
  `LeadActivityPanel.tsx`, the Kanban board's "Move to" select) use `focus:ring-1` with
  `focus:outline-none` and no `focus-visible` scoping, so the ring also appears on mouse
  click. Not a WCAG failure (a visible indicator still exists), just an inconsistency
  worth normalising to the shared pattern in a dedicated pass.

## How this review was done

Manual, source-level review of every file under `src/app/(site)`, `src/app/(dashboard)`,
`src/app/(auth)`, and `src/components/{site,dashboard,forms,ui}`, cross-checked against
WCAG 2.1 AA success criteria most relevant to a form-heavy B2B dashboard (1.1.1, 1.3.1,
1.4.1, 1.4.3, 2.1.1, 2.4.1, 2.4.3, 2.4.6, 3.3.1, 3.3.2, 4.1.2, 4.1.3). This session's
remote shell could not reliably bring up a full Next.js dev/production server within its
own per-command time budget (the same constraint already documented in `BACKLOG.md`
against the Playwright e2e suite), so no automated tooling (axe-core, Lighthouse, a real
screen reader) or visual verification was possible here - every finding above was
confirmed by reading the actual rendered JSX/HTML a component produces, not inferred.
**Recommended before shipping:** run `npm run build && npm run start` locally (or in CI)
and go through this review's fixed items with a real screen reader (VoiceOver/NVDA) and
keyboard-only navigation, and run an automated scanner (axe DevTools or Lighthouse) across
the consultation form, the dashboard overview, and the leads table as a baseline.
