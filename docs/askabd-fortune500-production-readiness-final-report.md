# ASKABD — FORTUNE 500 ENTERPRISE PRODUCTION READINESS & UAT REPORT

**Scope:** the complete, final consolidated verification gate for AskABD (`askabd-comparison`), continuing directly from the prior QA/UAT pass in this same session. Nothing here is claimed without evidence gathered this pass or directly re-verified this pass.

---

## 1. Executive Summary

AskABD's core product — real database-backed client records, a real 27-stage lifecycle engine, real service-driven onboarding requirements, real connector testing against a real database, a real (and now more complete) RBAC/tenant-isolation layer, and consistent evidence-based health scoring — held up under continued adversarial testing. This pass found and fixed **one further P0** (a client-side authentication bypass reachable in any environment, not just DEV) and **two further P2/cleanup items** (hardcoded `localhost` links that would silently fail on any real deployment, and an unconditional demo-hint disclosing a bypass code to every visitor regardless of environment). It also surfaced one significant, honestly-reportable **BLOCKED** finding: the sibling `askabd-identity` repository — the service meant to eventually provide AskABD's real production authentication — currently **does not compile** (12 real TypeScript errors) and its test suite cannot run at all. This is not new information invented for this report; it is the direct, current, reproducible state of that repository, checked fresh this pass.

One test failure was observed mid-pass (`operations-center-audit.test.ts`) and investigated rather than dismissed: it was a hardcoded-50ms timing race in a "fire-and-forget" audit-write test, triggered by unusually heavy concurrent load from three simultaneous background builds I was running at the time — not a code regression. Reproduced the failure's absence in isolation (7/7 passed) and in a subsequent full clean run (231/231 passed) to confirm.

**Verdict: READY FOR DEMO. NOT READY FOR PRODUCTION** — unchanged in kind from the prior pass, for the same root cause (no real production identity/authentication infrastructure exists yet), now with a more precise, current picture of exactly how far from ready the identity side is.

---

## 2. Architecture Status

Unchanged from prior passes, re-confirmed: monorepo (`apps/api` Fastify + PostgreSQL, `apps/web` Next.js), a real preHandler pipeline (auth → RBAC → tenant-access → rate-limit → audit → monitoring), a real 27-stage lifecycle state machine, a real service-catalog-driven requirement/connector-relevance engine (`ServiceRequirementMatrixService`), and a real evidence-based health-score engine shared by Readiness and Scorecard. No architectural changes made this pass — only fixes within the existing structure (an RBAC rule addition, a status-code fix, an auth-bypass removal, two link fixes).

## 3. Client Onboarding Status

The universal (non-service-specific) onboarding sequence — Identity Verification → Security Validation → Environment Registration → Connector Configuration → Discovery — is real, driven by `apps/api/src/services/requirements-service.ts`'s `serviceDefinitions`, not fabricated. Every field in it was read directly from source, not assumed. See Section 4 for the full field-level matrix.

**Real client onboarding flow, browser-verified**: Create client → OTP verification (see Section 9's finding on this) → identity/security/environment/connector requirement collection via the shared `RequirementWorkspace` component → lifecycle auto-advances only when the backend genuinely confirms readiness (`GET readiness`), never optimistically. No orphan clients, no missing client IDs, no fake health/progress found this pass (re-confirmed against a fresh browser walk of 3 different real clients).

## 4. Service-Driven Onboarding Requirement Matrix

This is the evidence-based answer to "what does AskABD actually need from a client, and when." Built from direct inspection of `requirements-service.ts` (the fixed universal sequence) and `oc_capabilities.external_dependencies` (the real, seeded, per-capability data driving `ServiceRequirementMatrixService`) — not inferred.

### 4a. Universal onboarding sequence (every client goes through this once, regardless of which services they later select)

| Stage | Field | Classification | Notes |
|---|---|---|---|
| Identity Verification | Business Owner Name | REQUIRED | |
| | Business Owner Email | REQUIRED | |
| | Legal Organization Name | REQUIRED | |
| Security Validation | Security Contact (name/email/phone) | REQUIRED | Designation field is OPTIONAL |
| | Compliance Certification (framework, status) | REQUIRED | Certificate number/expiry/certifying org are OPTIONAL |
| | Compliance Certificate document | REQUIRED (upload) | Security Policy document is OPTIONAL |
| | Authentication Preference (method) | REQUIRED | IdP URL, MFA flag are OPTIONAL |
| | Encryption Requirements | OPTIONAL | |
| | Network Restrictions | OPTIONAL | |
| Environment Registration | Environment List | REQUIRED | |
| | Primary Cloud Provider | REQUIRED | |
| | Infrastructure Contact | REQUIRED | |
| | VPN/Network Access | OPTIONAL | |
| Connector Configuration | Database Host / Port / Name / Username / Password | REQUIRED | SSL Mode is OPTIONAL |
| Discovery | Discovery Scope | REQUIRED | |
| | Read-Only Consent | REQUIRED (checkbox) | |

**AUTO-DERIVED, not asked**: business owner name/email are auto-populated onto the Identity Verification requirement directly from onboarding wizard data if already captured there (confirmed in `lifecycle/page.tsx`'s auto-populate effect) — the client is never asked twice.

### 4b. Service-selection-driven connector relevance (only asked if the client actually selects a matching capability)

Confirmed from real, seeded `oc_capabilities.external_dependencies` data (queried live, not assumed):

| If client selects... | AskABD asks for... | Classification |
|---|---|---|
| Discovery Engine, Connector Framework | Database connectivity / target database access (PostgreSQL, MySQL, MongoDB, etc.) | CONDITIONAL — only if selected |
| Integration Marketplace | Cloud provider SDK credentials | CONDITIONAL |
| Migration Execution | Target database write access | CONDITIONAL |
| CI/CD Pipeline | GitHub Actions, container registry | CONDITIONAL |
| Full Observability Stack | Prometheus, Grafana, OpenTelemetry collector | CONDITIONAL |
| Continuous Optimization Engine | Metrics provider (CloudWatch/Datadog) | CONDITIONAL |
| Disaster Recovery | Cloud storage (S3), cross-region infra | CONDITIONAL |
| One-Click Service Recovery | Docker socket access | CONDITIONAL |
| Event-Driven Architecture | Message broker (SQS/Kafka) | CONDITIONAL, currently NOT REPRESENTED in the connector catalog — honestly surfaced as an "unmapped dependency", never silently dropped or forced onto an unrelated connector |
| Compliance Automation | Compliance framework definitions | CONDITIONAL, NOT REPRESENTED in the connector catalog (same honest-surface treatment) |
| Client Onboarding, Notification Engine | SMTP provider | CONDITIONAL — platform-operational, not client-facing |
| Financial capabilities (payment methods, transactions, reconciliation) | Payment provider / external transaction source | CONDITIONAL, production-only ("for production" explicitly in the dependency text) |
| **The other ~27 of ~40 total capabilities** (Engineering Intelligence, Business Case Generation, Executive Reporting, Predictive Intelligence, Application Portfolio Management, Technical Debt Assessment, Gap Analysis, Decision Framework, etc.) | **Nothing** | **NOT CURRENTLY REQUIRED** — confirmed via direct query: their `external_dependencies` array is genuinely empty. These are computed from already-discovered/already-collected data, not separately connector-gated. |

**Migration-specific info (source system, destination, data scope)**: confirmed AUTO-DERIVED, not manually asked. `POST /oc/migration/plan` takes only `clientId` and an optional `sourceSchema` (default `'public'`) — the real schema is introspected from the already-connected source database, not collected via a separate form. This is a genuine, correct architecture choice (don't ask for what you can already see), contingent on the connector already being configured — which the lifecycle sequence enforces happens first.

**Confirmed live**: a client with zero services selected sees "No services selected for this client yet... AskABD only asks for the connections a client's selected services actually need" (Connectors page, verified in the prior pass and re-confirmed this pass) — never a blanket request for every possible credential.

## 5. Connection/Integration Trust

Real status vocabulary (`EvidenceStatus`, `evidence-status.tsx`): `verified` / `action_required` / `checking` / `failed` / `not_configured` / `not_yet_available` — always icon+text, never color alone. This is the platform's actual honest distinction between configured/tested/verified, even though the exact words differ from a generic example vocabulary — the underlying guarantee (never say "Connected" without a passed test) is real and was re-verified this pass:

- **Missing required field** (MongoDB, no host entered): real backend validation → `✕ Failed — Configuration Check — Host/endpoint is required`, with a full evidence trail (source/last-tested/result). Never a silent or generic failure.
- **Wrong credential** (PostgreSQL, wrong password — re-verified this pass on a third real client): `✕ Authentication — password authentication failed for user "comp_user"` — the real driver error.
- **Correct credential**: 8/8 real steps pass (DNS, Port, TCP, Auth, DB Access, Read Permission, Query Execution, Latency).
- **Save**: only persists what was actually tested; a stale "Verified" badge in the row header correctly reflects the last *saved* state, not an in-progress unsaved edit — confirmed not a bug (deliberate, correct separation between "what's saved" and "what you're currently testing").

**GitHub / Jira / AWS beyond what was already tested**: still **NOT TESTABLE — CREDENTIAL REQUIRED** in this environment. No change from the prior pass.

## 6. Authentication

Re-confirmed via direct code read and the real test suite (not re-litigated from scratch): DEV bypass is narrowly scoped to `NODE_ENV !== 'production' && no signing key configured`, production-shaped configs never bypass regardless of `NODE_ENV` value passed at request time, tampered/expired/wrong-issuer/wrong-audience/malformed tokens are all rejected in a production-shaped config.

### New P0 found and fixed this pass — client-side OTP verification bypass, not gated by environment at all

`verify/page.tsx`'s `verifyOtp()` function: when the `fetch()` call to `POST /oc/otp/verify` failed for **any** reason (network blip, the API being briefly unreachable, a timeout, a CORS misconfiguration — in **any** environment, including a real production deployment), the frontend silently treated the entered code as valid if it equalled `"123456"` — **without ever asking the server**. This is a distinct, more serious defect than the already-correct server-side demo-OTP gate (`operations-center-routes.ts`, `NODE_ENV !== 'production'` only, unaffected by this fix) — a transient outage of the real API would have let anyone who read the page's own visible hint text in. **Fixed**: on fetch failure, the UI now always shows "Verification service unavailable. Please check your connection and try again." and never proceeds. The legitimate server-verified path (API reachable, real or demo OTP correctly checked by the server) is completely unaffected.

### Related, lower-severity finding fixed alongside it

The demo-OTP hint text itself ("For demo: use OTP 123456...") was rendered unconditionally to every visitor in every environment, regardless of whether the demo OTP would even work there. Now shown only when the app is genuinely running in development — closing the "advertises a bypass code to real prospective clients in a demo/staging environment" exposure, and directly mitigating the already-documented risk (from the prior pass) that a staging deployment mistakenly running `NODE_ENV=development` would have DEV bypass active.

## 7. Authorization / RBAC

Unchanged and re-confirmed from the prior pass's fix (Jira integration routes now gated to `Admin.Access`, 7 passing tests) — no regressions, no new gaps found in currently-covered routes this pass.

## 8. Tenant Isolation

Unchanged from the prior pass's findings: URL/body/query `clientId` boundary is real and tested (12 + 6 tests); the documented opaque-resource-ID gap (~2 dozen routes: problems, gaps, reconciliation, defects, migrations, etc.) remains open, still requires new cross-cutting architecture to close properly, not attempted this pass for the same reason as before (out of safe-change scope, not a business decision this session can make unilaterally).

## 9. Data Integrity

Continued the sweep from the prior pass. No new production-facing fabrication found in the areas re-checked this pass (connector status, requirement matrix, OTP flow). The AI Copilot fix and Platform Score fix from the immediately preceding pass were re-confirmed still correctly honest, unaffected by this pass's changes.

## 10. Security

Combined with Sections 6–8 above. No SQL injection surface found (parameterized queries used throughout the routes inspected this pass and prior passes). Secret scan re-run (see Section 25/30) — clean.

## 11. Database Safety

No destructive operation performed. The one prior-pass chaos test (Postgres stop/start) was not repeated this pass (already proven in the immediately preceding pass); this pass's testing was read-heavy (requirement-matrix queries, connector status checks) plus the same connector save/service-enable pattern already proven idempotent under concurrency in the prior pass. No new data-safety concern found.

## 12. API Readiness

`/health` → `200`, `database: connected`. `/ready` → `200` when healthy, `503` when the database is unreachable (fixed in the immediately preceding pass, re-confirmed passing in this pass's full regression). API build: `tsc`, exit 0, this pass, fresh.

## 13. Web Readiness

Full clean production build this pass: `.next` wiped, dev server stopped first (per the established Windows cache-corruption rule), `npm run build` → exit 0. Dev server restarted and re-verified serving `200` afterward.

## 14. UI/UX

No new design-system work performed this pass beyond the three targeted fixes (Sections 6, and the two `localhost` link fixes below) — the enterprise design-system pass (PhaseHeader, EvidenceBadge, forms, tables, phase navigation, accessibility) was completed in the two immediately preceding passes and is unchanged, re-confirmed not regressed by this pass's edits (both touched files render correctly, `200`, browser-verified).

### New finding and fix — hardcoded `localhost` links

`platform/services/page.tsx`'s "Quick Links" unconditionally rendered `http://localhost:8025` (Mailpit) and `http://localhost:4200/health` (API Health) regardless of the actual deployed environment. On any real staging/production deployment, a viewer's own browser would try to reach "localhost" on *their own machine* — always failing, and unprofessional in front of the Fortune-500 reviewers this platform targets. **Fixed**: API Health now uses the real configured `NEXT_PUBLIC_API_URL`; the Mailpit link (a DEV-only tool that doesn't exist outside local development) now only renders when the app is genuinely running in development. Re-verified live: both links correct in this DEV environment.

## 15. Accessibility

Unchanged from the prior pass (app-wide duplicate-`<h1>` fix, heading-order fixes, `aria-expanded`/`aria-current`/`role="dialog"` additions) — not touched or re-broken this pass.

## 16. Responsive Testing

Unchanged from the prior pass (9 tables fixed for mobile scroll, zero confirmed overflow at 375/768/desktop on pages checked) — not touched or re-broken this pass.

## 17. Feature Completeness Matrix

| Feature | UI | API | DB | Integration | Auth | Tenant Isolation | Audit | Tests | Browser UAT | Status | Remaining Gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Client directory/creation | ✓ | ✓ | ✓ | — | DEV bypass only | ✓ (URL) | ✓ | ✓ | ✓ | 🟢 GREEN | Real prod auth pending |
| Client Overview / journey navigation | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ | 🟢 GREEN | — |
| Services (catalog selection) | ✓ | ✓ | ✓ | — | Admin-gated enable/disable | ✓ | ✓ | ✓ | ✓ | 🟢 GREEN | — |
| Requirements (identity/security/env/connector/discovery) | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ (history) | — | ✓ | 🟢 GREEN | No dedicated frontend unit tests |
| Connectors (PostgreSQL proven; others catalog-only) | ✓ | ✓ | ✓ | ✓ (PostgreSQL real; GitHub/Jira/AWS untested — no creds) | ✓ (tenant-scoped) | ✓ | — | ✓ | ✓ | 🟡 YELLOW | Non-DB connectors not independently exercised |
| Lifecycle (27-stage state machine) | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ (events) | — | ✓ | 🟢 GREEN | — |
| Discovery / Assessment / Gap Analysis | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ | 🟢 GREEN | — |
| Recommendations | ✓ | ✓ | ✓ | — | Admin-gated approve/reject | Opaque-ID (documented gap) | — | — | Reachability only | 🟡 YELLOW | Deep-tested last pass, not re-tested this pass |
| Engineering / Defects | ✓ | ✓ | ✓ | — | ✓ | Admin-gated list | — | ✓ | ✓ | 🟢 GREEN | — |
| Migration | ✓ | ✓ | ✓ | Real schema introspection | ✓ | Opaque-ID (documented gap) | ✓ | ✓ | ✓ | 🟢 GREEN for tested paths | Opaque-ID isolation gap applies |
| Testing / Validation (connection history) | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | 🟢 GREEN | — |
| Compliance | ✓ | ✓ | ✓ | — | ✓ | Opaque-ID (documented gap) | — | — | ✓ | 🟡 YELLOW | Opaque-ID isolation gap applies |
| Readiness | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ | 🟢 GREEN | — |
| Scorecard | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ | 🟢 GREEN | Consistent with Readiness, verified again this pass indirectly |
| Financial (payments/reconciliation/proposals/engagements) | ✓ | ✓ | ✓ | Real payment-provider dependency (prod only) | Admin-gated mutations | Opaque-ID (documented gap) | — | ✓ (28 payment-reconciliation tests) | Reachability only | 🟡 YELLOW | Deep-tested last pass, not re-tested this pass |
| Jira integration | ✓ | ✓ | ✓ | Real (untested — no live Jira instance) | ✓ (fixed this pass) | Partial (issue-create only) | ✓ | ✓ (11 tests total) | Reachability only | 🟢 GREEN for auth; 🟡 YELLOW for the untestable live integration | No real Jira instance available |
| AI Copilot | ✓ | — (none) | — | — | n/a | n/a | — | — | ✓ | 🟢 GREEN (honestly non-functional) | Real backend is a genuine future feature, not a defect |
| Client Settings (legacy demo clients only) | ✓ | — | Static | — | n/a | n/a | — | — | — | 🔴 RED (documented, zero real-client blast radius) | Needs real backend architecture (unchanged from prior pass) |

## 18. Client Journey

Re-walked with 3 different real clients this pass (`client-c9683df9`, `client-aa18f8f3`, `client-63d72dc5`) at Connectors, Services, Lifecycle, and OTP verification — all real, all consistent, all correctly scoped per-client (no stale-state bleed observed, re-confirmed).

## 19. Failure/Recovery Testing

New this pass: empty-required-field connector test (real, honest failure), OTP-service-unreachable path (now fails closed instead of bypassing, see Section 6). DB chaos test not re-run this pass (already proven in the prior pass); no changes to that code path this pass beyond the already-verified `/ready` status-code fix.

## 20. Browser UAT

Performed live, this pass: Connectors (3 clients), Platform Services quick-links, OTP verification page. Combined with the prior pass's full journey walk (Dashboard through Scorecard), the browser-UAT coverage across the platform remains current.

## 21. Automated Test Results

| Run | Files | Tests | Result |
|---|---|---|---|
| Fresh baseline (start of this pass) | 34 | 231 | 231/231 passed |
| Mid-pass, under heavy concurrent load (3 simultaneous background jobs) | 34 | 231 | 230/231 — 1 failure, diagnosed as a load-induced timing flake in a pre-existing hardcoded-50ms test, not a code regression |
| Isolated re-run of the failing file alone | 1 | 7 | 7/7 passed |
| **Final clean full run (isolated, authoritative)** | **34** | **231** | **231/231 passed** |

7 new tests added this session overall (`rbac-jira-integration.test.ts`, carried over from the prior pass), 0 removed, 0 weakened. `askabd-identity`'s own suite could not run — see Section 23.

## 22. Build Results

- API build (`tsc`): exit 0, fresh this pass
- Web build (`next build`, clean `.next` wipe): exit 0, fresh this pass
- `askabd-identity` build/typecheck: **FAILS** — see Section 23

## 23. Infrastructure Dependencies

- PostgreSQL (`comparison-postgres`): healthy throughout
- Mailpit (`askabd-mailpit`): healthy throughout
- **`askabd-identity` (sibling repo, real production auth service)**: `npm test`'s `pretest` hook (`tsc --noEmit`) fails with **12 real TypeScript errors** across `auth-service.ts`, `authorization-service.ts`, `mfa-service.ts`, `session-manager.ts`, `token-service.ts`, `webhook-dispatcher.ts` — reproduced directly (`npx tsc --noEmit`), not assumed from a cached report. Errors span: an object-literal property (`retryAfterMs`) not present in the `DomainError` type, several unused-import/unused-variable warnings-as-errors, and 4 errors from the installed `jose` library no longer exporting a `KeyLike` type it's referenced against (a dependency-version compatibility break). **This means the identity repository's test suite cannot currently be executed at all** — not "some tests fail," genuinely cannot run. This is a separate repository this session has not modified; documented here, not fixed, per the explicit instruction to STOP and document rather than invent a decision for out-of-scope work. Confirms and sharpens the existing, already-known "no real production identity" P0 from prior passes — the gap is not just "missing a JWKS endpoint," the service meant to eventually provide one does not currently build.

## 24. Production Blockers

1. **No real production authentication anywhere** (unchanged, pre-existing): `askabd-comparison`'s DEV bypass is correctly scoped and fails closed everywhere else, but no `JWT_SECRET`/`JWKS_URL` is configured for a real deployment; `askabd-identity` (the intended real issuer) is currently non-compiling (Section 23).
2. **No real user→client tenant mapping** (unchanged, pre-existing): admin/super_admin cross-client access is a documented, deliberate, but temporary stand-in.
3. **Opaque-resource-ID tenant-isolation gap** (unchanged, pre-existing): ~2 dozen mutation routes not covered by the clientId-based boundary.

## 25. Remaining RED Items

| Item | Location | Evidence | Business Impact | Security Impact | Recommended Solution | Safe to fix now? |
|---|---|---|---|---|---|---|
| `askabd-identity` does not compile | `apps/api/*.ts` — wait, `askabd-identity/src/services/*.ts` | 12 reproduced `tsc` errors | Blocks any real production authentication work | None directly (broken code, not a live vulnerability) | Fix the type errors (mix of trivial dead-code removal and a `jose` version/type compatibility fix), then re-run its test suite | **Not fixed this pass** — separate repository, outside this session's established scope; document and let the user decide whether to bring it into scope |
| Client Settings fabrication (legacy demo clients only) | `apps/web/src/app/clients/[clientId]/settings/page.tsx` | Confirmed zero real-client blast radius (prior pass) | None for real clients | None | Needs real backend architecture (audit-logged settings persistence, danger-zone confirmation flows) | Not fixed — architecture decision |

## 26. Remaining YELLOW Items

- Opaque-resource-ID tenant-isolation coverage (documented, prior pass)
- API error-response shape inconsistency (documented, prior pass, non-security)
- Non-database connectors (GitHub/Jira/AWS) not independently live-tested — no credentials available
- Financial/Recommendations/Compliance areas deep-tested in an earlier pass, not re-exercised this specific pass (no evidence of regression, just not re-walked)

## 27. BLOCKED Items

- `askabd-identity` repository fix — requires a decision on whether to bring a second repository into this session's working scope, and possibly a `jose` dependency version decision
- Real external connector verification (GitHub/Jira/AWS/SMTP-production/DNS) — requires real credentials this environment does not have and should not invent

## 28. Recommended Next Steps

1. Decide whether to extend this session's scope to `askabd-identity` and, if so, fix its 12 compile errors as a prerequisite to any further identity work.
2. Provide real GitHub/Jira/AWS credentials in a safe, non-production test tenant if independent verification of those connectors is wanted.
3. Make the architecture decision needed to properly fix the opaque-resource-ID tenant-isolation gap (a general resource-ownership resolver).
4. Make the architecture decision needed to properly rebuild Client Settings for real clients (currently a legacy-only concern, not urgent).

## 29. Exact Files Changed This Pass

- `apps/api/src/platform/rbac/rules.ts` *(prior pass — Jira RBAC gate; unchanged this pass, listed for completeness)*
- `apps/api/src/server.ts` *(prior pass — `/ready` 503 fix; unchanged this pass)*
- `apps/api/tests/health-readiness.test.ts` *(prior pass)*
- `apps/api/tests/rbac-jira-integration.test.ts` *(prior pass, new file)*
- `apps/web/src/app/platform/services/page.tsx` — **this pass**: hardcoded `localhost` Quick Links fixed
- `apps/web/src/app/verify/page.tsx` — **this pass**: client-side OTP bypass removed; demo hint gated to development only

## 30. Git Safety Status

```
git branch:          feature/reliability-hardening (unchanged)
git rev-parse HEAD:   a9082ca478b94a4dabf35dbe5a5076a1499b6226 (unchanged)
git diff --cached:    empty — nothing staged
```

No secrets, `.env` files, credentials, database dumps, build caches, Terraform caches, runtime uploads, or generated binaries among the tracked changes. No commit, push, reset, checkout, rebase, or stash performed. No destructive database operation performed this pass.

---

## FINAL VERDICT

**NOT READY FOR PRODUCTION.**
**READY FOR DEMO / STAGING** (with the explicit, standing caveat that any staging deployment must set `NODE_ENV=production` or otherwise disable DEV bypass — this remains the platform's single most important deployment-configuration requirement, and this pass closed one concrete way that gap could have been exploited in the UI, the client-side OTP fallback).

The application logic — client journey, service-driven onboarding, connectors, requirements, lifecycle, readiness, scorecard — is real, evidence-based, and has now survived two consecutive adversarial QA passes without any fabrication surviving to a real client's screen. The blocking gap for production remains squarely in the authentication/identity layer, and this pass sharpened exactly how far from ready that layer is: the intended real-auth service does not currently compile.
