# Service Governance — Architecture Audit

**Date:** 2026-08-17. Performed before any code change this milestone, per the explicit Phase 1 instruction.

This audit consolidates direct database/code inspection performed this milestone plus confirmed findings from the four prior milestones this session (Real Client Health/Engineering/Migration Intelligence; Enterprise Connection Validation; Service-Driven Client Onboarding; Authoritative Client Service Assignment) — it does not re-derive what was already established with evidence, but re-verifies nothing has drifted.

## 1. Authoritative client record

`oc_clients` (real, unchanged). `OperationsCenterService` is the sole write path.

## 2. Authoritative service catalog

`oc_capabilities` — 70 real platform capabilities (id, name, category, domain, status, maturity, description, business_value, dependencies, **external_dependencies**, roadmap_phase). Not a duplicate anywhere. `oc_service_bundles` groups them into 5 bundles.

## 3. Authoritative client-service assignment

`oc_client_services` (client_id, service_id, status, required, visible, enabled_at, disabled_at, enabled_by, reason). This is the **only** table that can make a service "confirmed" for a client — verified this milestone that the `GET /oc/clients/:clientId/services` route's `clientStatus` fallback (fixed in the prior milestone) never fabricates an `'enabled'` value.

## 4. Authoritative dependency definition

`oc_capabilities.external_dependencies` — real, curated, previously unexposed (exposed by the prior milestone). No second dependency table exists.

## 5. Authoritative connector record

`oc_connectors` + `oc_connection_tests`, written only by `ConnectorService` (real DNS/TCP/auth checks). Confirmed unchanged and still the sole source — this milestone added no new connector logic.

## 6. Authoritative connection verification result

`ConnectorService.testConnection()` return value, persisted via `persistResult()`. No second verification engine exists (`ProductionPreflightService` separately covers AskABD's own platform dependencies — a different, non-overlapping domain, confirmed in the prior milestone's audit).

## 7. Authoritative readiness calculation

`RequirementsService.getReadiness()` (onboarding-stage readiness) and `ConnectorService`'s per-connector status (connection readiness). No fabricated percentage-based readiness engine exists anywhere in the reachable/real-client code path.

## 8. Authoritative audit trail

`oc_audit_log`, written via `OperationsCenterService.createAuditEntry()` (best-effort, non-blocking, confirmed in an earlier milestone's hardening pass). `POST .../services/:id/enable` and `.../disable` already call this on every write — confirmed with a new test this milestone (`client-service-not-confirmed.test.ts`, from the previous milestone) and reused, not duplicated.

## 9. RBAC — what exists, precisely

Real, functional RBAC engine at `platform/rbac/` (`roles.ts`, `rules.ts`, `engine.ts`, `middleware.ts`), wired globally via `registerAuthMiddleware` + `registerAuthorizationMiddleware` in `server.ts`. **New finding this milestone, verified by direct code inspection and a passing test**: `middleware/auth.ts` never populates `AuthContext.metadata.roles` or `AuthContext.permissions` from any real JWT claim, for **any** route in the application — every authenticated request resolves to the `'customer'` role for authorization purposes (`extractRoles()`'s fallback). This is a real, pre-existing, deeper gap than the previously-reported "no RBAC rule exists for service assignment" — even a correctly-declared rule cannot yet be practically satisfied by any real user. See the final report's RBAC section for what this milestone did (and deliberately did not do) about it.

## 10. Duplicate sources of truth found

None newly found this milestone. Two **dead-code duplicates** (not competing sources of truth, since neither is ever read) confirmed still present from the prior connection-validation milestone: `email-service.ts` and `email-provider.ts` (only `email-transport.ts` is wired to the real send/health-check paths). One additional dead file found this milestone: `apps/web/src/app/lib/connector-framework.ts` — not imported anywhere in the web app.

## 11. Fallbacks found

The one fallback that mattered (`clientStatus` defaulting to `'enabled'`) was already fixed in the prior milestone. This milestone added a **second, narrower fallback tier**: a capability with a real `oc_engagement_services` row but no `oc_client_services` row now reports `'proposed'` instead of falling all the way to `'not_confirmed'` — itself never auto-promoted to `'enabled'`.

## 12. Defaults found

`oc_capabilities.status` default and `oc_client_services.status` default (`'enabled'` at the column level, but only ever reached through the explicit `POST .../enable` write path — never applied implicitly to a missing row). No change needed.

## 13. Stale/mock data still reachable by real clients

Confirmed still present (not fixed this milestone — see final report P1/P2): `mockClients`-gated pages (`applications`, `performance`, `infrastructure/servers/[serverId]`) contain `Math.random()`-based fabricated trend/metric data, but are **only reachable with fake data for legacy demo client IDs still in `mockClients`** — every real client hits `CapabilityPlaceholder` instead (itself the already-documented P0 fabricated-metrics fallback). This is bounded, quantified exposure, not a newly-discovered live risk to real clients beyond what the two prior reports already flagged.
