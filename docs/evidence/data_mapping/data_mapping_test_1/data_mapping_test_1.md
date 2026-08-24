# data_mapping_test_1 — Data Mapping Engine: real shape validation, one engine for two roadmap capabilities

**Feature under test**: `DataMappingEngine` (new) + `data-mapping-routes.ts` (new) — real field-level mapping between two systems, consolidating rows #41 (Migration Mapping Engine) and #74 (Data Mapping Engine).
**Test Suite**: `data_mapping_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — MASTER AUTONOMOUS COMPLETION DIRECTIVE, capabilities #41 + #74)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## A deliberate consolidation, not two engines

Per the directive's own explicit "do not create duplicate engines when an existing engine can be extended/reused" mandate: rows #41 ("Migration Mapping Engine") and #74 ("Data Mapping Engine") are the same real capability — a migration's field-level mapping between source and target systems IS a data mapping set. One engine was built; row #41 now points to row #74's own evidence rather than duplicating logic. A future Migration Platform pass (rows #40/#38) reuses `DataMappingEngine` directly.

## Search-before-building

`grep -rln "DataMapping\|FieldMapping\|oc_field_mapping\|oc_data_map"` across the API — zero matches. Genuinely `NOT_STARTED`, confirmed.

## Real, enforced shape validation — never silently accepted

`validateShape()` is the ONLY place mapping-type rules are checked, applied on both create AND update:

| Type | Real rule |
|---|---|
| `one_to_one` | exactly 1 source field + 1 target field |
| `one_to_many` | exactly 1 source field + 2+ target fields |
| `many_to_one` | 2+ source fields + exactly 1 target field |
| `calculated` | a real, non-empty transformation expression |
| `conditional` | a real, non-empty condition |
| `lookup` | a real, non-empty lookup table AND lookup key |

All 6 proven live, both the rejection and the correct-shape success path for each.

## Real status state machine

`draft → approved → implemented → validated`, with `deprecated` reachable from any non-terminal state, enforced via `STATUS_TRANSITIONS` (`InvalidMappingStatusTransitionError` on any invalid attempt) — proven live: `draft` cannot jump straight to `validated`.

## Real, non-fabricated completeness reporting

`getCompleteness()` returns actual counts — total fields, how many have a real transformation where their type requires one, how many are missing a data type, how many are missing a validation rule, and a real per-status breakdown — never a synthetic percentage. Proven live with a genuinely mixed set (1 complete field, 1 missing both dataType and validation).

## Object-level ownership

Every method on both `MappingSet` and the individual `FieldMapping` re-verifies real ownership (`MappingOwnershipError`, same 404-shape-for-both-cases discipline as every other opaque id this session) — proven live across get/create-under-wrong-client/read/remove.

## Security — RBAC + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role) | **403** |
| Staff (admin) | **200/201** |
| Cross-client mapping set id | **404** |
| Malformed/SQL-injection-shaped mapping id | **404**, safe, no leaked SQL error text |
| Invalid field-mapping shape over HTTP | **400** `invalid_mapping_shape`, never a fabricated success |
| Empty-body POST | Safe `<500` |

## Automated tests — 18 new, all real, none stubbed

`apps/api/tests/data-mapping-test-1.test.ts`: required-field validation, all 6 mapping-type shape rules (rejection + success), invalid status-transition rejection, real completeness counts, update re-validates shape, real deletion, full object-level ownership sweep, and 7 HTTP/RBAC/security tests.

Full local run: **18/18 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged. No dedicated UI yet (API-only this pass).

## FINAL STATUS: IMPLEMENTED

Real, security-audited, deliberately-consolidated Data Mapping Engine — one engine serving two roadmap capabilities rather than two overlapping ones. Capped below PASS only because no dedicated UI exists yet and Playwright remains `BLOCKED_EXTERNAL_AUTH`.
