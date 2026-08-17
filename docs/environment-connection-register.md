# Environment / External Connection Register (Phase 37)

**Date:** 2026-08-17. Built from direct inspection of `connector-service.ts` and
`production-preflight-service.ts`. No real secret value appears below — placeholders only.
Verification depth is reported honestly per provider — not every connector gets the same level of
test, and this register says so rather than implying uniform depth.

## Per-client connectors — depth of real verification

| Provider | Verification implemented | What it actually checks |
|---|---|---|
| PostgreSQL | **Deep, real** | DNS/network reachability, TCP connect, live authentication, database access, (per the prior "Connection Validation" milestone) required schema/permission checks |
| AWS | **Deep, real** | Endpoint reachability, credential validity, permission check against the specific resource required |
| Azure | **Deep, real** | Same pattern as AWS |
| GitHub | **Deep, real** | Endpoint reachability, token validity, required repository access (confirmed in the prior "Connection Validation" milestone: real `Authorization: Bearer` calls to the GitHub API, not simulated) |
| Kubernetes | **Partial, real, honestly labeled** | Returns an explicit `EXTERNAL DEPENDENCY` error — "Kubernetes authentication requires valid kubeconfig or service account token and @kubernetes/client-node SDK" — confirmed by direct code read; this is an honest incomplete-implementation marker, not a fabricated pass |
| All other 30 catalog providers (GitLab, Bitbucket, Azure DevOps, Jira [connector-catalog entry — see below for the separate platform-level Jira check], Confluence, ServiceNow, Prometheus, Grafana, Datadog, Splunk, Elastic, GCP, Docker Hub, Slack, PagerDuty, Okta, etc.) | **Generic, real, network-level only** | `testGeneric()` — real DNS/TCP port-reachability check against the configured host/endpoint (`checkPort`, actual socket connection, not simulated), explicitly marked `mode: 'real'`. Does **not** verify authentication or resource access for these providers — an honest, lesser depth than the 5 above, not concealed by the UI (Configured/Testing/Verified/Failed states apply the same way, but "Verified" here means "reachable," not "authenticated") |

## Platform-level (not per-client) real checks — `production-preflight-service.ts`

| System | Verification | Evidence |
|---|---|---|
| SMTP/Email | **Deep, real** | `checkEmail()` calls the real `email-transport.ts`'s `checkEmailHealth()` — nodemailer `transport.verify()`, a genuine SMTP handshake, not a config-presence check (fixed in the "Enterprise Connection Validation" milestone this session) |
| DNS | **Deep, real** | `checkDns()` performs a real `dns.resolve()` (fixed the same milestone) |
| Jira | **Deep, real** | `checkJira()` — real authenticated API call against the configured Jira instance |

## Required environment variables — placeholders only

```
DATABASE_URL (askabd-comparison):
<REQUIRED — STAGING VALUE — postgresql://user:pass@host:port/comparison>

JWT_SECRET / JWKS_URL (askabd-comparison):
<BLOCKED for real askabd-identity tokens — see docs/identity-real-contract.md. Usable only for
 DEV/test self-signed tokens today.>

DATABASE_URL (askabd-identity):
<REQUIRED — STAGING VALUE — postgresql://user:pass@host:5432/identity — separate database,
 confirmed no overlap with askabd-comparison's>

REDIS_URL (askabd-identity):
<REQUIRED — STAGING VALUE — provisioned but not yet used for key persistence, see
 docs/identity-real-contract.md Phase 3>

SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD:
<REQUIRED FOR PRODUCTION EMAIL — MISSING — not configured in this environment>

GITHUB_TOKEN (per-client, stored via connector save, never persisted raw — see
 docs/tenant-authorization-matrix.md "Connector credential exposure"):
<PROVIDED PER-CLIENT AT CONFIGURATION TIME, never in a shared env var>

AWS credentials, Azure credentials, Jira token (per-client, same pattern as GitHub):
<PROVIDED PER-CLIENT AT CONFIGURATION TIME>
```

For every field above without a real value in this environment: **MISSING — REQUIRED BEFORE
CONNECTION**, not silently skipped, per this milestone's explicit instruction.

## Status legend used throughout this and other docs

`NOT_CONFIGURED` → `CONFIGURED` → `TESTING` → `VERIFIED` or `FAILED`. `CONFIGURED` never implies
`VERIFIED` anywhere in this codebase (re-confirmed this milestone — `oc_connectors.status`
column values are `configured`/`connected`/`failed`, set only by an actual `testConnection()`
result, never defaulted to `connected` on save alone — `saveConfiguration()` sets `status =
'configured'`, and only `persistResult()`, called after a real test, can set `connected` or
`failed`).
