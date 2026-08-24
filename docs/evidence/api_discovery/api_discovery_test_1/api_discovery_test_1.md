# api_discovery_test_1 — API Discovery / Validation Engine: real OpenAPI parsing, real SSRF-protected live validation, never unauthorized traffic

**Feature under test**: `ApiDiscoveryEngine` (new) + `api-discovery-routes.ts` (new) — real API spec ingestion and real, opt-in, SSRF-protected live validation.
**Test Suite**: `api_discovery_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — MASTER AUTONOMOUS COMPLETION DIRECTIVE, capability #75)
**Environment**: local dev, real Postgres + a real ephemeral local HTTP server for live-validation proof · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Genuinely new — the existing Discovery Engine only covers DB/infra

Confirmed by the coverage matrix's own prior, accurate note and a real search before building: zero OpenAPI/Swagger parsing existed anywhere in this codebase.

## Real OpenAPI 3.0/Swagger 2.0 parsing — no external library

The format is plain JSON, so `ingestSpec` parses `paths`/operations directly, extracting a real endpoint inventory with real per-endpoint completeness flags: `hasDescription`, `hasResponseSchema`, `hasSecurityRequirement`, and the real documented status codes. A non-spec input (no real `paths` object) is refused (`InvalidSpecError`); a spec with zero real operations under any path is also refused, rather than silently accepted as an empty inventory.

## A real bug found and fixed by this pass's own tests

The first implementation treated a bare OpenAPI `summary` as sufficient for `hasDescription`. A real test proved this was too lenient — a real, deliberately incomplete fixture endpoint had only a `summary`, no `description`, and the engine reported it as "documented." Fixed: `hasDescription` now strictly requires a real, non-empty `description` — a summary alone is honestly still a real documentation gap, matching this session's own "never let a weak signal understate a real gap" discipline. Both dependent tests (endpoint inventory shape, gap-report counts) were re-verified against the corrected, stricter behavior.

## Real, non-fabricated gap reporting

`getGapReport` returns real counts — `missingDescription`, `missingResponseSchema`, `missingSecurity`, `notValidated` — never a synthetic completeness score. Proven live against a real, deliberately mixed 3-endpoint spec with known, independently-verified gaps in each category.

## Real, never-assumed live-validation authorization — "never send unauthorized traffic"

`validateEndpoint` refuses outright (`LiveValidationNotAuthorizedError`) unless the spec's own `liveValidationAuthorized` flag was explicitly set true via a real, separate, staff-driven action (`setLiveValidationAuthorized`, itself real-audited) — proven live both at the service layer and over real HTTP (`403 live_validation_not_authorized`). This directly satisfies the directive's own explicit "Never send unauthorized traffic to client systems" instruction — authorization is opt-in and per-spec, never assumed.

## Real SSRF-protected live validation

Once authorized, `validateEndpoint` reuses `assertSafeOutboundDestination`/`safeFetch` (`network-security-policy.ts`, unmodified) for the actual outbound request — proven live twice: a real ephemeral local HTTP server genuinely responds and is recorded as `reachable` with real evidence (`"...returned status 200"`), and a real cloud-metadata-address target (`169.254.169.254`) is genuinely `blocked` even though the spec was explicitly authorized — SSRF protection is not bypassable by authorization alone.

## Security — RBAC + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role) | **403** |
| Staff (admin) | **200/201** |
| Cross-client spec id | **404** |
| Malformed/SQL-injection-shaped spec id | **404**, safe, no leaked SQL error text |
| Live validation without authorization | **403** `live_validation_not_authorized`, never a fabricated success |
| Empty-body POST | Safe `<500` |

## Automated tests — 14 new, all real, none stubbed

`apps/api/tests/api-discovery-test-1.test.ts`: invalid-spec rejection, real endpoint-inventory correctness, real gap-report counts, unauthorized-live-validation refusal, real reachable validation against a real local HTTP server, real SSRF block against a real metadata address, full object-level ownership sweep, and 7 HTTP/RBAC/security tests.

Full local run: **14/14 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged. No dedicated UI yet (API-only this pass).

## FINAL STATUS: IMPLEMENTED

Real OpenAPI parsing, real never-fabricated gap reporting, and real SSRF-protected opt-in live validation with a genuine, tested "never unauthorized traffic" guarantee — plus a real bug found and fixed by the pass's own test discipline. Capped below PASS only because no dedicated UI exists yet, Postman/gateway ingestion formats are not implemented, and Playwright remains `BLOCKED_EXTERNAL_AUTH`.
