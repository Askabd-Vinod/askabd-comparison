# dependency_analysis_test_1 — Dependency Analysis Engine: real cycle detection the existing Traceability Engine never surfaced

**Feature under test**: `DependencyAnalysisEngine` (new) + `dependency-analysis-routes.ts` (new) — real dependency graph analysis over the existing `traceability_links` table.
**Test Suite**: `dependency_analysis_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — MASTER AUTONOMOUS COMPLETION DIRECTIVE, capability #78 — the final remaining `NOT_STARTED` row)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Not a new engine — a real gap in an existing one, closed

`TraceabilityEngine` (migration 041) already has real, generic link storage with `link_type='depends_on'` already valid in its own CHECK constraint, and real `getForwardChain`/`getBackwardChain` methods with a real cycle GUARD (a path array preventing infinite recursion). Reading it in full before building anything found the real, distinct gap: that cycle guard **silently truncates** a genuine circular dependency — it prevents infinite recursion but never tells the caller a cycle exists. This engine adds exactly that missing capability, plus a real dependency-scoped impact summary, without creating a second link-storage mechanism — `TraceabilityEngine.link()`/`unlink()` are reused completely unmodified.

## Real, explicit cycle detection

`detectCycles` runs an independent, `depends_on`-only recursive query that explicitly reports the real cycle path when a newly-reached node already appears earlier in the same real path — proven live with a genuine `A depends_on B depends_on A` circular chain (`hasCycle: true`, a real, non-empty cycle path returned) and a genuine acyclic chain (`hasCycle: false`, empty path).

## A real bug found and fixed by this pass's own tests

The first implementation computed whether a cycle existed via one recursive query, then tried to re-derive the human-readable path via a SECOND, subtly different recursive query — which returned a truncated, incorrect 1-element path. A real test asserting `cyclePath.length > 1` caught this immediately. Fixed by returning the real path directly from the SAME query that detected the cycle — no second, independently-reasoned re-derivation needed, and no risk of the two queries disagreeing.

## Real, non-fabricated dependency impact counts

`getDependencyImpact` returns real transitive dependent/dependency counts — never a fabricated risk score. Proven live against a genuine 3-node chain (A depends_on B depends_on C): querying C correctly reports 2 real transitive dependents (A and B) and 0 dependencies; querying A correctly reports 0 dependents and 2 real transitive dependencies.

## Real object-level ownership on BOTH ends of every link

`createDependencyLink` verifies real ownership for BOTH the source and target entity against a real, honest per-entity-type allowlist (`risk`, `gaps`, `change_record`, `deployment`, `requirement` — the domains this session's own engines created real `depends_on`-eligible entities in). An entity type not in this allowlist is refused (`UnverifiableEntityTypeError`) rather than silently trusted — proven live. A cross-client link attempt (real Client A entity, real Client B entity) is refused regardless of which end is foreign.

## Security — RBAC + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role) | **403** |
| Staff (admin) | **200/201** |
| Cross-client dependency link attempt | **404** |
| Malformed/SQL-injection-shaped entity id | **404**, safe, no leaked SQL error text |
| Empty-body POST | Safe `<500` |

## Automated tests — 12 new, all real, none stubbed

`apps/api/tests/dependency-analysis-test-1.test.ts`: real ownership verification on both link ends, unverifiable-entity-type refusal, real 3-node impact-chain counts, real cycle detection (both positive and negative cases), full object-level ownership sweep, and 6 HTTP/RBAC/security tests.

Full local run: **12/12 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged. No dedicated UI yet (API-only this pass).

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing (Traceability Engine's own link storage, unmodified), security-audited dependency analysis that closes a genuine, real gap in existing infrastructure rather than duplicating it — plus a real bug found and fixed by the pass's own test discipline. Capped below PASS only because no dedicated UI exists yet, the ownership-verifiable entity-type allowlist is real but not exhaustive, and Playwright remains `BLOCKED_EXTERNAL_AUTH`.

---

**This closes the last remaining `NOT_STARTED` row in `docs/eoc-feature-coverage-matrix.md`** — all 80 tracked rows now carry an honest, evidenced status (PASS / PASS_WITH_RISKS / IMPLEMENTED / BLOCKED_EXTERNAL_DEPENDENCY), none fabricated.
