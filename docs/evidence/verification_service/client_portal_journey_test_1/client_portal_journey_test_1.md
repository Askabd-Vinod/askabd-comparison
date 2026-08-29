# client_portal_journey_test_1 — the 17th and final Business Journey, fully real

**Directive**: "ASKABD — FINAL PRODUCT COMPLETION + CLIENT PORTAL + REAL
PLAYWRIGHT ULTIMATE VALIDATION GATE".
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## Investigation first (Part 2's classification A–E)

Before writing code, the actual repository was inspected to determine why
Client Portal was the one remaining `blocked` journey:

- `apps/web/src/app/(portal)/client-portal/[clientId]/page.tsx` — **747
  lines**, a real, substantial, working customer-facing product page
  (home/actions/problems/gaps/transformations/financial/optimization/
  notifications/timeline/team/requests tabs, real search, real service
  requests).
- `apps/web/src/app/(portal)/client-portal/[clientId]/journey/page.tsx`
  — 229 lines, also real.
- `apps/web/src/app/(portal)/layout.tsx` — a real, deliberately separate
  customer-portal shell with its own session-keepalive.

**Verdict: category D — implemented but incorrectly classified**, not A
(genuinely missing). The Client Portal *product* was never missing; only
the Business Journey Engine's own automated *runner* for it had no real
implementation, because — unlike every other journey, which exercises a
staff-side flow — this one requires a genuine CUSTOMER identity, and the
journey engine had no established pattern for minting one without
fabricating a login.

## The real solution found

`InvitationService.createInvitation`/`acceptInvitation` (both
pre-existing, unmodified) together perform the exact real flow a real
customer clicking a real email link goes through:

1. `createInvitation` creates a real `oc_invitations` row and returns a
   real `acceptUrl` containing the real raw token — the identical value a
   real email would carry (no need to poll an inbox to get it: reading it
   directly from the service's own return value is not fabrication, it's
   using the real artifact at its real source).
2. `acceptInvitation(rawToken, credential)` performs a REAL registration,
   verification, credential-store, and login against the REAL, running
   `askabd-identity` service (confirmed via `identityFetch`, no mocking —
   the exact same pattern `invitation-service.test.ts` already uses and
   has proven safe), creating a real `client_identity_mapping` row (the
   platform's actual authorization bridge) and returning a real, valid
   customer `accessToken`.

This is a completely real, non-fabricated customer session — not a
synthetic bypass.

## What the new journey proves

1. Real client + a real second client (cross-tenant target) created.
2. Real invitation created for a real, unique email.
3. Real invitation accepted via the real identity service — real
   accessToken issued.
4. Real `client_identity_mapping` row verified in the database.
5. **Real own-client access**: `GET /api/v1/oc/portal/:clientId/home`
   with the real accessToken → real `200`.
6. **Real cross-client denial**: the same real accessToken against a
   DIFFERENT real client's portal route → real `401`/`403`/`404` denial.
7. Real unauthenticated denial (no token at all) → real `401`.
8. Real audit-log entry for the client creation confirmed.
9. Real, complete cleanup: the real `client_identity_mapping` revoked,
   the real identity fixture deleted from `askabd-identity`'s **own**
   database (audit_event/access_token/refresh_token/session/credential/
   verification_token/identity rows, matching the exact, already-proven
   pattern `invitation-service.test.ts` uses), both real disposable
   clients deleted (the real invitation row cascades away automatically
   via its own `ON DELETE CASCADE` to `oc_clients`).

## Testing

`business-journey-engine-test-1.test.ts`: the Client Portal test
**passed on its first real run** — no bugs found this time (unlike
Migration Validation/Security Validation in the prior pass), a genuine
positive signal that the underlying invitation/identity-mapping/tenant
-access infrastructure is solid. Full suite: 19/19 passing (net-neutral
count — the old 2-test "honestly blocked" block was replaced by 2 new
real tests). Full API regression: **98 files / 1018 tests, all passing**.
`tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Live verification — through the REAL product UI, not just the API

Using the Browser pane (Playwright remains `BLOCKED_EXTERNAL_AUTH` — no
credential was extracted or persisted; this is explicitly disclosed as
interim verification, never presented as Playwright evidence): a
standalone, real, disposable client + invitation was created, and its
real `acceptUrl` was opened directly in the browser:

1. **Real signup page** rendered correctly, recognizing the real client
   name ("Live Browser Walkthrough Demo Client") and the real invited
   email.
2. Entered a real password twice, clicked **"Accept invitation & sign
   in"** — real signup completed, real redirect to the real client
   -portal dashboard for the correct client.
3. Real dashboard rendered: real tabs, real honest `0%`/`$0` stats for a
   genuinely fresh client (never fabricated non-zero placeholder data),
   real "AskABD is analyzing your environment" state.
4. Clicked the real **"Requests"** tab — real navigation worked, showing
   real action buttons (Request a Service / Connector / Support /
   Report an Incident / Request a Change) and an honest "No requests
   yet" empty state.
5. Navigated directly to a **different, real, pre-existing, protected
   client's** portal URL while still authenticated as this customer —
   the real UI correctly rendered **"Access denied — Your organization
   is not authorized to view this client workspace."** — genuine,
   live, human-observable proof of tenant isolation at the UI layer,
   not just the API layer.
6. Signed out via the real "Sign out" button.
7. Cleaned up: the real demo client and its real identity fixture were
   deleted via direct SQL/script (same pattern as the automated
   journey's own cleanup), independently re-verified absent.

No screenshots could be physically saved to disk (no capability exists
in this environment to persist Browser-pane screenshot bytes to a file —
`BLOCKED_EXTERNAL_EVIDENCE`, a consistent, previously-disclosed
limitation, not new to this pass); each step was visually confirmed
inline during the walkthrough instead.

## A self-correction made before this evidence doc was finalized

The coverage matrix's row #82 was initially updated to **PASS**. Before
committing, this was checked against the matrix's own, earlier-established
"AUTHENTICATED PLAYWRIGHT EVIDENCE RULE" (this session's own standing
methodology note): any row whose Playwright evidence is
`BLOCKED_EXTERNAL_AUTH` is capped at `PASS_WITH_RISKS`, never plain
`PASS`, regardless of how thorough the Browser-pane verification was.
Corrected to **PASS_WITH_RISKS** before committing — the feature itself
is genuinely complete and correct; the cap reflects the evidence
mechanism, not a functional gap.

## Database / cleanup

Comprehensive, precisely-scoped orphan sweep across BOTH databases
(`askabd-comparison`'s own Postgres AND `askabd-identity`'s own Postgres)
found **zero orphans**: verification-journey clients, demo-walkthrough
clients, `client_identity_mapping` rows, `oc_invitations` rows, and real
identity fixtures. The 4 real, protected `oc_clients` rows (pre-dating
this session) confirmed unchanged.

## Server health

`localhost:4200` (API, restarted cleanly via `tsx watch`, confirmed
healthy each time), `localhost:3100` (Identity, genuinely exercised by
real registration/verification/login calls throughout this pass,
confirmed healthy), and `localhost:3001` (web, used for the real
browser walkthrough, confirmed healthy) all verified before, during, and
after this work.

## Result

**All 17 of 17 Business Journey Engine journeys are now real,
implemented, tested, and live-verified.** See
`docs/final-validation/final-product-completion-test-1.md` for the full,
final validation report.
