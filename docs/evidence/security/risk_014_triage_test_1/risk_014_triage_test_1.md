# risk_014_triage_test_1 — RISK-014 individual triage pass, 7 real cross-client RBAC gaps closed

**Feature under test**: `platform/rbac/rules.ts` (existing file, extended) — closing real gaps identified but explicitly not fixed during `portfolio_intelligence_rbac_test_1`'s mechanical audit.
**Test Suite**: `risk_014_triage_test_1` (2026-08-24, continuation after `dependency_analysis_test_1` closed the coverage matrix's last `NOT_STARTED` row)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## What this pass did

`docs/security-risk-register.md`'s RISK-014 entry disclosed 46 candidate routes from a mechanical audit (no `:clientId` in the URL path, no explicit RBAC rule) as "not yet individually triaged" rather than blindly fixed. This pass reads the highest-risk-looking group in full — the one the register itself flagged as "the most likely place a genuine further finding exists" — and triages each handler individually rather than pattern-matching by shape alone.

## 7 real, confirmed gaps — fixed

Each was confirmed by reading its handler in full AND by grep-confirming the customer-facing `apps/web/src/app/(portal)` frontend never calls it (only staff `(app)` pages/components do), then closed with a real `Admin.Access` rule in `rules.ts`:

| Route | Real exposure before this fix |
|---|---|
| `GET /oc/clients` | Lists every client on the platform |
| `GET /oc/clients/:id` | Fetches ANY client by id — no ownership check at all (unlike `PUT :id`, which already had a `tenant-access.ts` backstop) |
| `GET /oc/clients/health-summary` | Every client's real, persisted health score in one response |
| `GET /oc/audit` | The full platform audit log, every client, every entity |
| `POST /oc/audit` | Write access to inject fabricated audit entries for any actor/entity |
| `GET /oc/notifications` | Every client's notifications when no `?clientId=` filter is supplied |
| `POST /oc/notifications` | Create a notification for an arbitrary `clientId`, no ownership check |

## A methodology correction found and applied mid-pass

The next 4 candidates in the same group (`GET /oc/operations`, `POST /oc/service-actions`, `POST /oc/defects`, `POST /oc/incidents`) were initially assumed to be further real gaps by the same "clientId in body/query, no `rules.ts` rule" reasoning used for the 7 above. Before writing that into the register, each was checked with a **live `app.inject` call**, not just a handler read — and the assumption was wrong for 3 of the 4:

- `tenant-access.ts` already inspects `request.body.clientId` and `request.query.clientId` generically for every `/api/v1/oc/**` route (a pre-existing, unmodified capability — see `tenant-access-body-query.test.ts`). Live-verified: `GET /oc/operations?clientId=<foreign>`, `POST /oc/defects` with a foreign `clientId`, and `POST /oc/incidents` with a foreign `clientId` were **already correctly denied** with `403 tenant_not_resolved`, before this pass touched anything.
- `POST /oc/service-actions` turned out to have no `clientId` concept at all — `ServiceActionInput`/`oc_service_actions` is keyed by an opaque `entityId`, the exact class of route `tenant-access.ts`'s own doc comment already discloses as unresolved ("routes that reference a client only indirectly through an opaque resource ID ... remain NOT covered here"). Left genuinely open and disclosed, not conflated with the clientId-shaped findings.
- `POST /oc/incidents` with `clientId` omitted entirely succeeds and persists a real `client_id: NULL` incident — a real, disclosed, low-severity data-hygiene gap (unattributed record creation), not a cross-tenant leak.

See `docs/security-risk-register.md` RISK-014's 2026-08-24 triage-pass update for the full corrected accounting.

## Security — live proof (Security Testing Addendum)

`apps/api/tests/risk-014-triage-test-1.test.ts`, 5/5 passing:

| Scenario | Result |
|---|---|
| Customer token, every newly-gated GET route | **403** |
| Customer token, every newly-gated POST route | **403** |
| Unauthenticated, every newly-gated route (GET+POST) | **401** |
| Staff (admin) token, every newly-gated GET route | **allowed** (not over-blocked) |
| Pre-existing sibling rule (`POST /oc/clients`) | unaffected, still **403** for a customer |

## Regression

Full suite: **855/855 passing** (850 baseline + 5 new), zero unexplained failures. `tsc --noEmit` clean. No migration in this pass — no DB orphan check needed. Both protected real clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unchanged (same ids/timestamps) after this pass.

## FINAL STATUS: PASS

Real, live-verified fix for 7 confirmed severe cross-client exposures, plus a real methodology correction (verify against the live middleware chain, not just `rules.ts`, before calling something a gap) that prevented recording 3 false positives into the risk register. 2 genuinely open, lower-severity items disclosed rather than fixed or ignored. 35 of the original 46 candidates remain untriaged — RISK-014 stays open for that remainder.
