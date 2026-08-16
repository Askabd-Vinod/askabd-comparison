# Enterprise Reliability Hardening — Technical Design (Rev 2)

## 1. Executive Summary

This design addresses 9 MISSING and 5 PARTIAL reliability capabilities required for enterprise-grade client onboarding. The architecture introduces a **reusable platform reliability layer** — not a one-off fix — that applies to ALL requirement submissions, document uploads, connector operations, discovery, assessment, migration, and lifecycle transitions.

**Root cause of the observed "Unable to reach AskABD API" error:** The frontend `saveRequirement()` uses a 30-second `AbortController` timeout. When the API responds slowly (common during DEV cold-start, heavy DB operations, or when multiple requirements auto-populate on first load), the abort fires. The frontend immediately shows a failure message even though the backend may have already committed the data. There is no reconciliation.

---

## 2. Current Architecture

See previous design section A (unchanged).

---

## 3. Current Data Flow

See previous design section B (unchanged).

---

## 4. Complete 20-Item Traceability Matrix

| # | Requirement | Current Impl | Status | Evidence | Risk | Target | Change | Test |
|---|-------------|-------------|--------|----------|------|--------|--------|------|
| 1 | Visible saving state | `setSaving(reqKey)` → "Saving..." | IMPLEMENTED | requirement-workspace.tsx:L100 | Low | Keep | None | Existing |
| 2 | API readiness check before save | None — save calls PUT directly | MISSING | requirement-workspace.tsx:L104 | High | Check /ready, show "Starting..." if not | Add pre-check | New |
| 3 | Backend field validation | `validateFields()` in service | IMPLEMENTED | requirements-service.ts:L251 | Low | Keep | None | Existing |
| 4 | Database transaction | 3 separate queries (UPDATE+INSERT+SELECT) | MISSING | requirements-service.ts:L216-L240 | Critical | BEGIN/COMMIT wrapper | Wrap in txn | New |
| 5 | Enriched success response (readiness+blockers) | Returns only requirement record | PARTIAL | operations-center-routes.ts:L805 | High | Add readiness to PUT response | Enrich response | New |
| 6 | Re-fetch state after save | Not done — updates local array only | MISSING | requirement-workspace.tsx:L112 | High | Call loadAll() after success | Add refresh | New |
| 7 | Readiness auto-updates after save | Only on full page reload | MISSING | lifecycle/page.tsx:L293 | High | loadReadiness() triggered | Add callback | New |
| 8 | Lifecycle auto-sync | Only on requirements==ready + specific status | PARTIAL | lifecycle/page.tsx:L270-L280 | Medium | Trigger after save callback | Wire callback | New |
| 9 | Error classification (categories A-G) | 3 categories (timeout/network/other) | PARTIAL | requirement-workspace.tsx:L118-L130 | Medium | 8 categories with remediation | Rewrite catch | New |
| 10 | Retry with bounded backoff | None | MISSING | — | High | Max 3, 1s/2s/4s for transient | Add retry | New |
| 11 | Timeout reconciliation | Timeout = immediate "failed" | MISSING | requirement-workspace.tsx:L120 | Critical | Verify → reconcile state | Add verify flow | New |
| 12 | Idempotent save (no duplicates) | UPDATE by PK (safe) | IMPLEMENTED | requirements-service.ts:L192 | Low | Keep | None | Existing |
| 13 | No false success | Only shows success on 200 | IMPLEMENTED | requirement-workspace.tsx:L108 | Low | Keep | None | Existing |
| 14 | No false failure (timeout case) | Timeout = "failed" always | MISSING | requirement-workspace.tsx:L120 | Critical | Reconcile before declaring failure | Add verify | New |
| 15 | Correlation ID visible on errors | API generates x-request-id, not shown in UI | PARTIAL | server.ts:L33, error handler | Low | Display ref ID on errors | Add display | New |
| 16 | Client isolation | All queries by clientId | IMPLEMENTED | All services | Low | Keep | None | Existing |
| 17 | Environment-aware API URL | NEXT_PUBLIC_API_URL | IMPLEMENTED | env.ts, all components | Low | Keep | None | Existing |
| 18 | API startup readiness (/health, /ready) | Both exist, DB warmup before listen | IMPLEMENTED | index.ts:L82, server.ts:L86 | Low | Keep | None | Existing |
| 19 | Frontend waits for API readiness | No pre-check | MISSING | — | High | Cached readiness check | Add check | New |
| 20 | Document upload reliability | Basic upload with no retry | PARTIAL | requirement-workspace.tsx:L135 | Medium | Add timeout/retry/reconcile | Enhance | New |

### Summary: 6 IMPLEMENTED, 5 PARTIAL, 9 MISSING (0 INCORRECT, 0 NEEDS VERIFICATION)

---

## 5. Complete Gap Register

### CRITICAL (3)
- **GAP-01:** No transaction boundary on requirement save — partial writes possible
- **GAP-02:** No timeout reconciliation — false failure on slow saves
- **GAP-03:** No post-save state refresh — stale UI after successful save

### HIGH (4)
- **GAP-04:** No API readiness pre-check — save attempted against unavailable API
- **GAP-05:** No retry mechanism for transient failures
- **GAP-06:** Readiness/blocker count not updated after save
- **GAP-07:** Lifecycle not evaluated after requirements become ready

### MEDIUM (3)
- **GAP-08:** Generic error messages without remediation guidance
- **GAP-09:** Correlation ID not shown to user on errors
- **GAP-10:** Document upload has no retry/reconciliation

---

## 6. Root Causes

| Symptom | Root Cause |
|---------|-----------|
| "Unable to reach API" on save | 30s timeout fires during slow auto-populate on first requirement GET; subsequent PUT also times out. No retry, no reconciliation. |
| Stale requirement status | Frontend updates local array from PUT response but does NOT re-fetch readiness or trigger parent refresh |
| Lifecycle stuck | Lifecycle auto-advance only runs on `useEffect` dependency change; no explicit trigger after save |
| Partial DB state possible | Three queries without transaction boundary |
| Duplicate history entries | History INSERT not protected against retry (not idempotent) |

---

## 7-15. Target Architecture

(Sections 7-15 remain as specified in Rev 1 with the following additions)

### Transaction Strategy (Detail)

**Transaction owner:** `RequirementsService.updateRequirement()`
**Connection:** Acquires dedicated client from `sharedPool` (not the pool-level query)
**Isolation level:** PostgreSQL default (READ COMMITTED) — sufficient for single-row updates
**Deadlock handling:** Single-row UPDATE by PK — no deadlock possible
**Nested operations:** Audit INSERT is inside the transaction (atomic with save)
**Retry:** Transaction-level retry on serialization failure (max 1 retry)
**Timeout:** No query-level timeout (pool-level 30s connect timeout is sufficient)
**Rollback:** On any error, ROLLBACK releases all locks

### Idempotency (Detail)

**Key:** `clientId + serviceId + requirementKey` (composite primary key)
**Mechanism:** UPDATE (not INSERT) — inherently idempotent
**History deduplication:** Add `version` check — only INSERT history if version actually incremented
**Lifecycle deduplication:** Lifecycle transition already rejects duplicate events (version + status check)
**Audit deduplication:** Include `version` in audit detail — downstream can deduplicate
**Concurrency:** Last-writer-wins (acceptable for requirement forms — single user per client)

### Frontend State Model

```
IDLE → SAVING → SUCCESS (auto-refresh) → IDLE
IDLE → SAVING → TIMEOUT → VERIFYING → SUCCESS | FAILED → IDLE
IDLE → SAVING → FAILED (classified) → IDLE (retry available)
```

---

## 16-30. Platform-Wide Coverage

### Applies To (Reusable Pattern)

| Module | Uses Requirement Pattern | Uses Transaction | Uses Retry | Uses Reconciliation |
|--------|--------------------------|------------------|------------|---------------------|
| Identity Verification | ✅ | ✅ | ✅ | ✅ |
| Security Validation | ✅ | ✅ | ✅ | ✅ |
| Environment Registration | ✅ | ✅ | ✅ | ✅ |
| Connector Configuration | ✅ | ✅ | ✅ | ✅ |
| Discovery Consent | ✅ | ✅ | ✅ | ✅ |
| Connector Testing | Custom | ✅ | ✅ | ✅ |
| Discovery Execution | Custom (long-running) | ✅ | N/A | Progress polling |
| Assessment Execution | Custom (long-running) | ✅ | N/A | Progress polling |
| Migration Execution | Custom (long-running) | ✅ | N/A | Progress polling |
| Commercial/Payment | Existing pattern | ✅ | ✅ | ✅ |

---

## Implementation Phases

### Phase 1: Backend Transaction + Enriched Response
- **Files:** `requirements-service.ts`, `operations-center-routes.ts`
- **Risk:** Low (backward-compatible response enhancement)
- **Rollback:** Remove transaction wrapper, remove extra response fields

### Phase 2: Frontend Post-Save Refresh + Callback
- **Files:** `requirement-workspace.tsx`, `lifecycle/page.tsx`
- **Risk:** Low (additive behavior)
- **Rollback:** Remove loadAll() call, remove callback prop

### Phase 3: Timeout Reconciliation
- **Files:** `requirement-workspace.tsx`
- **Risk:** Medium (new async flow)
- **Rollback:** Revert to immediate failure message

### Phase 4: Error Classification + Correlation ID
- **Files:** `requirement-workspace.tsx`
- **Risk:** Low (display-only)
- **Rollback:** Revert to generic messages

### Phase 5: Retry with Backoff
- **Files:** `requirement-workspace.tsx` (or shared utility)
- **Risk:** Low (bounded, idempotent)
- **Rollback:** Remove retry wrapper

### Phase 6: API Readiness Pre-Check
- **Files:** `requirement-workspace.tsx` (or shared hook)
- **Risk:** Low (non-blocking enhancement)
- **Rollback:** Remove pre-check

---

## Files Affected

| File | Phase | Change |
|------|-------|--------|
| `apps/api/src/services/requirements-service.ts` | 1 | Transaction wrapper |
| `apps/api/src/routes/operations-center-routes.ts` | 1 | Enriched PUT response |
| `apps/web/src/app/components/requirement-workspace.tsx` | 2-6 | Refresh, reconciliation, error classification, retry, pre-check |
| `apps/web/src/app/clients/[clientId]/lifecycle/page.tsx` | 2 | onSaveComplete callback |

---

## Database Changes
None.

## API Changes
- PUT `/oc/client-services/:clientId/:serviceId/requirements/:key` response adds `readiness` and `blockers` fields

## Frontend Changes
- RequirementWorkspace: post-save refresh, timeout reconciliation, error classification, retry, API readiness check
- Lifecycle page: callback wiring

## Test Changes
- New: transaction rollback test
- New: timeout reconciliation test
- New: enriched response test
- Existing 103 tests must pass unchanged

## Environment Changes
None.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Transaction increases latency | Low | Low | Single-row ops, <10ms overhead |
| Retry storm under load | Low | Medium | Bounded (max 3), exponential backoff, jitter |
| Reconciliation race condition | Low | Low | Version comparison is deterministic |
| loadAll() after save adds extra request | Certain | Low | Single GET, <100ms |

---

## Evidence Required Before Declaring Complete

1. 103 existing vitest tests pass
2. Fresh client: save requirement → readiness updates immediately (no refresh)
3. Simulated timeout: UI shows "Verifying..." then confirms save
4. API unavailable: UI shows classified error with "Retry" action
5. Retry succeeds: transient failure resolved automatically
6. Transaction: simulate error after UPDATE → history not created (rollback verified)
7. Duplicate save: no duplicate history entries
8. Client isolation: Client A save does not affect Client B
9. Lifecycle advances after all requirements complete
10. Correlation ID visible on error messages

---

**STATUS: DESIGN REVIEW COMPLETE — NOT APPROVED FOR IMPLEMENTATION**

Awaiting approval to proceed to Phase 1 implementation.
