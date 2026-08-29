# Hercules Handoff Readiness

**Purpose**: document AskABD's current architecture, security posture, and
reusable intellectual property so future application development on
Hercules can start from informed decisions rather than rediscovery. This
document does **not** propose migrating AskABD to Hercules, rewriting it
in Convex, or replacing PostgreSQL — AskABD remains the current reference
platform, unchanged in stack or architecture by this document.

**Date**: 2026-08-29 · Companion to `docs/final-askabd-production-readiness.md`.

## Current architecture

- **Frontend**: Next.js 15 (App Router), `apps/web`. Server Components by
  default; `apiSafe()`/`api()` (`lib/api.ts`) read a same-site
  `askabd_staff_token` cookie via `next/headers` for server-side
  authenticated fetches — the only correct pattern for Server Components,
  since they have no `window` object and cannot use the client-side
  interceptor below. Client Components rely on a one-time global
  `window.fetch` monkey-patch (`installFetchInterceptor()` in
  `staff-auth-guard.tsx`, installed from the root layout) that attaches
  the real staff bearer token to any request to the API origin while on a
  guarded internal-console route, with proactive renewal and a
  retry-once-on-401. Both patterns are real, load-bearing, and must not
  be "simplified" into one without re-verifying every consumer.
- **Backend**: Fastify (`apps/api`), TypeScript, `tsx watch` in dev. Real
  startup validation (17-point readiness check logged on boot). Route
  files under `src/routes/`, service layer under `src/services/`,
  migrations under `src/db/migrations/` (numbered, sequential, applied via
  `npm run migrate`).
- **Database**: PostgreSQL. Two distinct Prisma schemas exist in this
  repository — `prisma/schema.prisma` (root, backs the marketplace:
  `merchant`/`brand`/`item_price`/`offer`/`review`) and a separate schema
  under `apps/api` for the Operations Centre's own tables
  (`oc_clients`, `oc_verification_*`, etc.) — a real architectural
  distinction to preserve, not merge casually, if reused elsewhere.
- **Authentication**: separate `askabd-identity` service issuing
  short-lived (~2min) EdDSA JWTs + refresh tokens, verified via JWKS. A
  `devBypass` exists for local development only, gated by
  `NODE_ENV !== 'production' && !JWT_SECRET && !JWKS_URL` — confirmed
  this pass to be correctly unreachable in any real production
  configuration.
- **RBAC**: `platform/rbac/rules.ts` (a declarative route→permission
  table) + `platform/rbac/middleware.ts` (enforcement) +
  `platform/rbac/tenant-access.ts` (a second, independent layer enforcing
  `client_id` ownership on top of role checks — `pathPrefix:
  '/api/v1/oc/'`-scoped, which is why the marketplace surface under
  `/api/v1/merchants/*` needed its own separate audit rather than
  inheriting this protection).
- **Security engines**: `network-security-policy.ts` (SSRF/DNS-rebinding
  protection, reused by every outbound connector), `maskSecrets()` (used
  platform-wide for secret redaction in logs/errors/audit), a real,
  typed `*OwnershipError → 404` pattern for object-level authorization,
  applied consistently across ~15+ engines this session found and fixed
  gaps in.
- **Verification & Validation Automation Service**: a real, reusable
  platform capability (not a script) — service catalog, health checks,
  run history, GO/NO_GO/GO_WITH_RISKS/BLOCKED computation, and a Business
  Journey Engine. See row #82 of the coverage matrix and its own evidence
  docs for the full architecture.
- **Deployment**: no real external CI/CD exists in this environment
  (RISK-011). `.claude/launch.json` defines the local dev-server
  configurations (`web`/`api`/`identity`/`website`) used throughout this
  engagement via the Browser pane's `preview_start`/`preview_stop`.

## Known risks and blockers carried forward

See `docs/security-risk-register.md` in full. Summary: 12 of 17 tracked
risks `RESOLVED`, 4 genuinely `OPEN` (RISK-007, 008, 010, 017), 1
`BLOCKED_EXTERNAL_DEPENDENCY` by design (RISK-011, no real deployment
infrastructure). None of the open risks are `NO-GO`-severity as of this
report.

## Reusable IP for future Hercules applications

The following patterns are real, tested, and proven across many engines
in this codebase — genuinely reusable architecture, not just working
code specific to AskABD's domain:

- **Object-level ownership pattern**: a typed `*OwnershipError` per
  resource type, mapped to `404` (never `403`, to avoid confirming a
  protected resource's existence to an unauthorized caller). Applied
  uniformly across connectors, discovery runs, risks, changes,
  deployments, data mappings, API specs, dependency links, and more.
  Directly portable to any multi-tenant application.
- **Two-layer RBAC + tenant-isolation split**: role/permission checks
  (declarative rule table) kept fully independent from resource-ownership
  checks (a second middleware layer). This session's own repeated
  discovery pattern — "RBAC present but tenant-isolation absent" or vice
  versa — shows why keeping these as two explicit, separately-testable
  layers (rather than one conflated check) makes gaps mechanically
  discoverable via a route-registration/rule-table diff script, which
  this session reused successfully across three separate audit passes
  (RISK-009, RISK-012, RISK-014).
- **Mechanical route-audit script**: parse every `server.<method>()`
  registration, diff against the RBAC rule table, filter by heuristics
  (no `:clientId` in path, etc.) to surface candidate gaps for individual
  triage. Reusable as-is for any Fastify-based service.
- **Verification & Validation Automation Service architecture**: real
  service catalog + health-check registry + run history + GO/NO-GO
  computation + business-journey runner, all as first-class database
  -backed platform capabilities rather than ad-hoc scripts. The
  Business Journey Engine's own pattern — real disposable fixture →
  real engine exercise → real independent-query assertion (never trust
  the engine's own self-report) → real cleanup with independent
  re-verification — is a directly reusable testing philosophy for any
  future application's own "prove it, don't just run a unit test" bar.
- **Honest-disclosure UI pattern**: `<DemoDataBanner />`, a single
  reusable component + a documented rule ("mock data is allowed only as
  an explicitly-identified fixture, never presented as production
  truth") — cheap to replicate in any new application from day one
  rather than retrofitted later.
- **SSRF/DNS-rebinding protection** (`network-security-policy.ts`,
  `safeFetch`): validates every DNS-resolved address per redirect hop,
  blocks private/loopback/link-local/metadata ranges outside local dev.
  Directly reusable for any application making outbound requests to
  caller-supplied hosts (connectors, webhooks, integrations).
- **Secret-masking discipline**: a single `maskSecrets()` utility applied
  consistently at every boundary (API responses, logs, audit records,
  error messages) rather than ad-hoc per-call redaction.
- **Audit engine pattern**: a single, global, automatic write-hook
  (`registerAuditEngine`) rather than per-feature manual audit calls —
  reduces the "did we remember to log this" class of gap.

## Lessons learned (process, not just code)

- **A route's own code comment claiming "already enforced by X" must be
  independently proven, not trusted** — found repeatedly true and false
  in roughly equal measure across this session's audits.
- **A prior pass's own conclusion can be wrong and should be
  investigated, not defended** — demonstrated multiple times this
  session, most recently within this very pass (the demo-banner
  self-correction documented in
  `docs/evidence/final_readiness/demo_data_disclosure_test_1/`).
- **Mechanical, repeatable audit scripts (route/RBAC diffing, mockClients
  sweeps, secret-literal greps) find real gaps faster and more completely
  than manual page-by-page review** — worth building early in any new
  application, not retrofitted after gaps have already shipped.
- **Live, authenticated browser verification is qualitatively different
  from — and not a substitute for — real automated Playwright evidence**,
  but is a legitimate, real verification mechanism in its own right when
  clearly labeled as such and never conflated with the other.
- **Credential handling discipline**: a real, active staff session was
  found live in the Browser pane mid-session; it was used only through
  normal interactive navigation, never extracted or persisted for
  automation, even though doing so was technically possible and would
  have unblocked Playwright. This is the correct posture for any future
  application development involving live credentials — automation
  convenience never justifies extracting a human's live session token.

## What is explicitly NOT recommended

- Do not migrate AskABD to Hercules or rewrite it in Convex.
- Do not replace PostgreSQL in AskABD.
- Do not change AskABD's existing architecture merely because a future
  Hercules application uses a different stack — the patterns above are
  documented for **conceptual reuse**, not literal code sharing across
  incompatible stacks.
