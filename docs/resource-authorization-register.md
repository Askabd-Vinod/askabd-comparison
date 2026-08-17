# Resource Authorization Register

**Date:** 2026-08-17, updated during the "final product completion" pass. Per-resource-type
register, built from the actual route table in `apps/api/src/routes/operations-center-routes.ts`
(~220 routes) cross-referenced against `apps/api/src/platform/rbac/rules.ts` and
`apps/api/src/platform/rbac/tenant-access.ts`. Every row reflects the code as it exists now —
re-verified, not assumed carried-over.

## Update this pass: body/query-param bypass closed

`tenant-access.ts`'s `extractClientId()` previously only inspected the URL's own route params.
**Fixed this pass**: it now also inspects the request body (`clientId` field) and query string
(`?clientId=`), closing the connector test/save, Jira issue-create, and incidents/defects
query-filter gaps listed as "NOT covered" below in the prior version of this register. Additionally,
`GET /oc/incidents` and `GET /oc/defects` (which return every client's rows when the `clientId`
query filter is omitted entirely) are now explicitly gated to `Admin.Access`, matching the
established platform-wide-aggregate pattern. Proven by 6 new tests
(`tests/tenant-access-body-query.test.ts`), verified live in the browser under DEV bypass
(unaffected, as expected). The rows below are updated to reflect this — not left stale.

Columns: **Owner** = which table/service holds the data. **Tenant carrier** = how the client is
identified on the route. **Authorization today** = the actual enforced rule.

| Resource | Owner | Tenant carrier | Authorization today |
|---|---|---|---|
| Clients (list/detail) | `oc_clients` | `:clientId`/`:id` in URL (list has none — inherently cross-client) | List: admin/super_admin only (see note below); Detail: tenant-access (admin/super_admin) |
| Client lifecycle | `oc_lifecycle_*` | `:clientId` in URL | tenant-access (admin/super_admin) |
| Services (client-scoped) | `oc_client_services`, `oc_capabilities` | `:clientId` in URL | tenant-access + `Admin.Access` on enable/disable (double-gated) |
| Connectors (list/save/test) | `oc_connectors` | `:clientId` in URL for list/get; **`clientId` in BODY, not URL, for `/connectors/test` and `/connectors/save`** | List/get: tenant-access. **Test/save: NOT covered — body-only clientId, flagged Remaining P1 in the prior milestone's final report, unresolved** |
| Requirements/documents | `oc_client_service_documents`, requirements service | `:clientId` in URL | tenant-access |
| Problems (Problem Universe) | `oc_problems` | `:clientId` in URL for client-scoped list; **`:problemId` (opaque) for detail/status/financial/effort routes** | List: tenant-access. **Detail/mutation by opaque ID: NOT covered, defaultPolicy `authenticated` only** |
| Gaps | `oc_gaps` | Same pattern as Problems | Same split — list covered, opaque-ID mutation not |
| Transformations | `oc_transformations` | `:clientId` for list; `:id` opaque for status | List covered; status mutation not covered |
| Capabilities (catalog) | `oc_capabilities` | No `:clientId` — this is a platform-wide catalog, not client data | Correctly outside tenant scope (not a gap) |
| Continuous Optimization (metrics/baselines/findings) | `oc_optimization_*` | `:clientId` for client-scoped GET/POST; `:findingId` opaque for promote/acknowledge/resolve | Client-scoped routes covered; opaque-ID finding-lifecycle actions not covered |
| Portfolio (cross-client aggregates) | Multiple `oc_*` tables | No single client — inherently cross-client by design | Correctly outside tenant scope (not a gap) — `/oc/portfolio/*` |
| Client Portal | `oc_*` (various) | `:clientId` in URL | tenant-access |
| Known Information | `oc_*` | `:clientId` in URL | tenant-access |
| Events (SSE stream + list) | `oc_events` | `:clientId` in URL | tenant-access |
| Workflow rules | `oc_workflow_rules` | **No `:clientId` at all — platform-wide rules, not per-client** | `defaultPolicy: authenticated` only (any role) — correctly a platform-admin surface in intent, but not gated to `Admin.Access` today; flagged below |
| Notification preferences | `oc_*` | `:clientId` in URL | tenant-access |
| Escalations | `oc_escalations` | `:clientId` for list; `:escalationId` opaque for acknowledge/resolve | List covered; acknowledge/resolve not covered |
| Scheduler jobs | `oc_scheduler_jobs` | No `:clientId` — platform-wide | `defaultPolicy: authenticated` only — same gap as workflow rules |
| Compliance | `oc_compliance_*` | `:clientId` for most routes; `:exceptionId`/`:controlId` opaque for a few — but `POST /compliance/exceptions/:exceptionId/transition` was explicitly gated to `Admin.Access` this milestone's prior work | Mostly covered; the one opaque-ID mutation route is separately gated |
| Service bundles | `oc_service_bundles` | Catalog (no client) for `/service-bundles`; `:clientId` for `/recommended` | Catalog correctly ungated; recommended list covered |
| Commercial engagements | `oc_commercial_engagements` | `:clientId` for list/create; `:id` opaque for detail/transition/services/pricing/proposals | List covered; `:id`-opaque routes: transition explicitly `Admin.Access`-gated (prior milestone); detail/pricing/proposals GET not covered |
| Proposals | `oc_proposals` | `:id` opaque throughout | Transition explicitly `Admin.Access`-gated; GET not covered |
| Payment methods | `oc_payment_methods` | `:clientId` for list/create; `:id` opaque for default/verify/disable | List covered; verify/disable explicitly `Admin.Access`-gated (prior milestone); `default` action NOT separately gated — **new finding this milestone, see below** |
| Transactions | `oc_transactions` | `:clientId` in URL | tenant-access |
| Reconciliation | `oc_reconciliation` | `:clientId` for summary/exceptions list; `:id` opaque for execute/transition/items — execute/transition explicitly `Admin.Access`-gated | Mixed, mostly covered |
| Jira config/test/issues | `oc_jira_*` | **No `:clientId` for config/test/issue-create** (`clientId` in body for issue-create); `:clientId` for links list | Config/test/issue-create NOT covered by tenant-access; links list covered |
| Defects | `oc_defects` | `:defectId` opaque throughout (no client-scoped list route with `:clientId`) | NOT covered — `defaultPolicy: authenticated` only |
| Incidents | `oc_incidents` | Query-param `clientId`, not a route param | NOT covered by the URL-param mechanism |
| Health score/snapshot | `oc_client_health_snapshots` | `:clientId` in URL | tenant-access |
| Audit | `oc_audit_log` | Query-param `clientId`, not a route param | NOT covered by the URL-param mechanism |

## New finding this milestone: `POST /oc/payment-methods/:id/default`

Not previously flagged. Setting a payment method as the client's default is a state-changing,
financially-relevant action, addressed by opaque `:id`, currently reachable by any authenticated
identity regardless of role (`defaultPolicy: authenticated`). Unlike `verify`/`disable` (already
gated to `Admin.Access` in the prior milestone), this specific route was missed. **Fixed this
milestone** — see the final report's "Changes Made."

## Summary — coverage honestly counted

Of the ~220 routes in `operations-center-routes.ts`:
- **~130 routes** carry `:clientId` (or `:id` under `/clients/`) directly and are covered by the
  tenant-access boundary.
- **~12 routes** are explicit governance verbs on opaque IDs, individually gated to
  `Admin.Access` (service enable/disable, recommendation approve/reject, compliance exception
  transition, engagement/proposal transition, payment verify/disable/default, reconciliation
  execute/transition/exception-transition).
- **~15 routes** remain genuinely uncovered — opaque-ID reads/mutations (problems, gaps,
  transformations, optimization findings, escalations acknowledge/resolve, defects, connector
  test/save, Jira config/test/issue-create) and query-param-scoped reads (incidents, audit). None
  of these expose credential secrets (confirmed for connectors in the prior milestone); the
  exposure where it exists is business-data visibility across clients for identities holding a
  real, non-admin, non-DEV-bypass token — which, as established, no live path currently issues.
- **~65 routes** are legitimately platform-wide/catalog/cross-client-aggregate routes
  (capabilities catalog, portfolio aggregates, service-bundles catalog) that correctly have no
  per-client tenant check because they are not client-scoped data.

This is the same honest accounting as the prior milestone's tenant-authorization-matrix.md,
re-verified and extended with the payment-methods `default` finding.
