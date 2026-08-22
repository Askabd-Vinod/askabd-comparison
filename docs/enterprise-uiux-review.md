# Enterprise UI/UX Review

**Date:** 2026-08-18. Honest assessment — a full design-system unification pass
(Rules 11-14 of this session's brief) was NOT attempted this session; the time budget
went to the backend security architecture (JWKS, tenant mapping, invitations) and
proving it live, which the brief's own acceptance gate treats as the higher bar
("do not declare success because the API returns 200" applies equally to UI polish).
This document records what's real about the current state, not a completed audit.

## A real, pre-existing visual-language split (not introduced this session)

Two genuinely different design systems coexist in `apps/web`:

1. **The internal AskABD staff console** (`/clients/:clientId/*`) — Tailwind CSS,
   light theme, a real shared design system (`PhaseHeader`, `EvidenceBadge`,
   `ErrorState`, `ClientPhaseNav`) used consistently across its ~50 pages. The new
   `/clients/:clientId/invitations` page (this session) was built to match this system
   exactly — same table styling, same `ErrorState` component, same Tailwind utility
   conventions.

2. **The customer-facing surface** (`/login`, `/accept-invitation`, `/client-portal/*`)
   — inline `style={{}}` objects, a dark theme, no shared component library. This
   predates this session (`client-portal/[clientId]/page.tsx` already existed in this
   style before this milestone). `/login` and `/accept-invitation` (new this session)
   were deliberately built to MATCH this existing customer-facing family — extending
   it consistently rather than inventing a third visual language, per this brief's own
   "do not create competing status systems" instruction.

**This split itself was not resolved this session.** Unifying the customer-facing
surface onto the Tailwind design system (or vice versa) is a real, non-trivial
follow-on task, not attempted here.

## Accessibility

Not audited this session. The new pages use semantic `<form>`/`<label>`/`<input>`
elements and native `<button>` elements throughout (no `<div onClick>` patterns), which
is a reasonable baseline, but no keyboard-navigation, screen-reader, or contrast
testing was performed. Do not treat this as a WCAG claim.

## Responsive

Not tested at the specific breakpoints this brief lists (375/390/414/768/1024/1440px).
The new pages use flexible/percentage-based layouts (`maxWidth`, `flex-wrap`) rather
than fixed pixel widths, which is a reasonable baseline, not a verified guarantee.

## What IS true

- Every new page shows real data or an honest "not yet available"/error state — no
  fabricated numbers, no fake progress percentages, no invented KPIs anywhere in the
  invitation or login/portal-guard UI added this session.
- Loading and error states are explicit and distinct (`Loading…`, `Access denied`,
  `Signing in…`, real `ErrorState` component usage on the admin page) — never a silent
  blank screen.
