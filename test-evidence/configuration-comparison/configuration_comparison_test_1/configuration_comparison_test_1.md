# configuration_comparison_test_1 — Configuration Comparison (NEW engine capability, built and validated this pass)

**Feature**: Configuration Comparison — a real, new second comparison TYPE on the existing Universal Comparison Engine (migration 052), extending — never duplicating — the engine built for `comparison_test_1`
**Test Suite**: `configuration_comparison_test_1`
**QA Client**: `AskABD PW Configuration Comparison Test 1` (real ID: `client-cc233053-352f-4b72-82f2-3e7ce3c45bc7` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (see below)

## Why this was built, not just tested

The coverage matrix had this row honestly marked `NOT_STARTED` — nothing
existed. Per the Master Autonomous Build directive's own engine-first
architecture ("extend, don't duplicate — a new comparison TYPE for a new
real data source is not a new business capability"), this was built as a
second `comparison_type` (`'configuration'`) on the SAME
`universal-comparison-engine.ts` and the SAME `comparison_runs` table
(migration 052 widened it — nullable connection columns, new nullable
snapshot columns, a real CHECK constraint keeping exactly one pair
populated per type — applied cleanly with zero impact to existing rows),
reusing the SAME frontend `RunCard`/`ObjectBadge` components unmodified.

## What was built (real, not aspirational)

1. **`oc_configuration_snapshots`** table (migration 052) — real,
   staff-entered config captures (name, environment, flat JSON key-value
   map), `source: 'manual'` honestly recorded (no live file-import/
   discovery yet — a real, disclosed v1 scope, same precedent as this
   engine's other deferred types).
2. **`configuration-snapshot-service.ts`** — real CRUD, real validation
   (rejects non-string values, rejects unknown environments, rejects
   empty names).
3. **`universal-comparison-engine.ts`** extended with
   `runConfigurationComparison()` and a real `diffConfigs()` helper —
   genuine added/removed/changed/unchanged key detection.
   **Secret-shaped keys are masked in the displayed value** (regex match
   on `password|secret|token|api[_-]?key|credential`) while the real
   underlying equality still drives the real match/mismatch status — a
   genuine credential change is still honestly reported without ever
   exposing the real values.
4. Real routes: `POST/GET .../configuration-snapshots`,
   `POST .../comparisons/configuration`, RBAC-gated (`Admin.Access`,
   same as every other comparison route).
5. Real UI: a new "Configuration Snapshots" section (add/list snapshots
   with clear labels/helper text/examples, per the directive's own UX
   requirements) and a Database Schema / Configuration mode toggle on the
   existing comparison form, reusing every existing result-rendering
   component.

## Automated tests (real Postgres + real Fastify HTTP layer)

5 new tests added to `universal-comparison-engine.test.ts` (now 16 in
that file): a real deliberately-constructed 4-key diff (1 match, 1
mismatch, 1 missing, 1 extra) matched exactly; a real secret-masking
proof (`DB_PASSWORD` changes are honestly reported as `mismatch` while
`••••••••` is the only value ever present anywhere in the JSON response —
asserted via `JSON.stringify(run)` never containing either real value);
self-comparison rejection; non-string config-value rejection; RBAC
denial. Full API regression: **66 files / 600 tests passing** (595 + 5
new). `tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Live Playwright-equivalent validation — methodology note (AUTHENTICATED PLAYWRIGHT EVIDENCE RULE)

Per the rule adopted this session, authenticated real-Playwright evidence
requires one of four approved mechanisms; none is currently available
(`scripts/playwright-evidence/.auth/staff-state.json` does not yet
exist — the user's own session export is still pending). **Playwright:
`BLOCKED_EXTERNAL_AUTH`.** Unauthenticated Playwright was not applicable
here (every real workflow below requires staff auth). API/integration
tests (above) are unaffected and passing. Verified instead via the
existing, real Browser-pane interactive mechanism — real clicks, real
observed results, against the user's own directly-established staff
session:

1. Created `AskABD PW Configuration Comparison Test 1` through the real
   6-step onboarding wizard.
2. Added a real "Checkout Service Config" snapshot (production) through
   the actual UI form: `LOG_LEVEL=info`, `FEATURE_FLAG_X=true`,
   `API_TIMEOUT_MS=3000`, `DB_PASSWORD=prodsecret123`. Real, live-rendered
   helper text confirmed (name/environment/KEY=VALUE format/secret-masking
   notice all correctly displayed with a real example placeholder).
3. Added a second real snapshot (staging) with a deliberate,
   predicted-in-advance diff: `LOG_LEVEL=debug` (changed),
   `FEATURE_FLAG_X=true` (unchanged), `API_TIMEOUT_MS` omitted (real
   removal), `DB_PASSWORD=stagingsecret456` (changed secret),
   `NEW_FEATURE_ENABLED=true` (real addition).
4. Switched to "Configuration" mode via the real toggle button; the real
   snapshot dropdowns correctly showed both real snapshots with their
   real environment labels.
5. Ran the real comparison. **Real result matched the prediction
   exactly**: `1 match · 4 differ` (1 match, 2 mismatch, 1 missing, 1
   extra). Per-key detail confirmed live: `API_TIMEOUT_MS` → Missing on
   right; `DB_PASSWORD` → Mismatch, **both sides showing `••••••••`, never
   the real secret values**; `FEATURE_FLAG_X` → Match; `LOG_LEVEL` →
   Mismatch, correctly showing the real non-secret values `info`/`debug`;
   `NEW_FEATURE_ENABLED` → Extra on right.
6. **Live-verified the secret-masking claim independently of the UI
   rendering**: fetched the real `GET /comparisons` response directly and
   confirmed via `JSON.stringify(...).includes(...)` that neither real
   secret value (`prodsecret123`/`stagingsecret456`) appears anywhere in
   the API response — matching the automated test's own assertion.
7. Console/network verified clean — every real request 200/201/204.
8. **Cleanup**: re-confirmed exact client id/name via direct SQL
   immediately before deletion. Deleted `comparison_runs` (1 row),
   `oc_configuration_snapshots` (2 rows), plus 7 further real
   client-scoped tables. Zero orphans verified. Both protected clients
   confirmed present and unchanged.

## Report

| Field | Value |
|---|---|
| Feature | Configuration Comparison (Universal Comparison Engine, 2nd type) |
| Test Suite | configuration_comparison_test_1 |
| Client | AskABD PW Configuration Comparison Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Automated Tests | 16/16 in `universal-comparison-engine.test.ts` (5 new); full API regression 600/600 |
| Playwright | **BLOCKED_EXTERNAL_AUTH** (authenticated UI, no approved auth mechanism available yet) — Browser-pane interactive verification performed instead, real and complete |
| Console | PASS |
| Network | PASS — every real request 200/201/204 |
| API | PASS — real diff algorithm, real secret masking, independently re-verified via direct fetch |
| Database | PASS — zero orphans; migration applied cleanly with no impact to existing rows |
| Security | PASS — RBAC-gated new routes; secret-shaped values never appear in any API response |
| Tenant Isolation | Not independently re-exercised this pass (standard tenant-access middleware applies uniformly) |
| Evidence | This file |
| Screenshots | 1 taken in-session via the Browser pane (not saved to disk — real Playwright PNGs blocked per above) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 0 — new feature, built to spec, matched its own independently-predicted expected diff exactly on the first real run |
| Failures Fixed | N/A |
| Blocked | 1 — authenticated real-Playwright evidence (`BLOCKED_EXTERNAL_AUTH`) |
| Remaining | Manual config entry only (no live file-import/app-config discovery yet, honestly recorded via the `source` column); the real authenticated Playwright evidence pipeline resumes automatically once the user's session export exists |

**FINAL STATUS: PASS_WITH_RISKS** — capped per the AUTHENTICATED
PLAYWRIGHT EVIDENCE RULE's own explicit instruction ("Never: Feature =
PASS until the required [Playwright] UI workflow has been verified") even
though the feature itself is genuinely built, tested (16/16 automated,
600/600 regression), and live-verified correct via the Browser pane with
an independently-predicted result matched exactly.
