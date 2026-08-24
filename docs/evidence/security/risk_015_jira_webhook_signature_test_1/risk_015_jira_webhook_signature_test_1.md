# risk_015_jira_webhook_signature_test_1 — real, cryptographic Jira webhook signature verification

**Feature under test**: `POST /oc/jira/webhook` real HMAC-SHA256 signature verification (RISK-015, resolved) — replacing structural-JSON-only validation with real cryptographic authentication.
**Test Suite**: `risk_015_jira_webhook_signature_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE directive, Phase 1: security backlog)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## The real fix

`docs/production-connection-readiness.md` had documented "Shared secret header validation" for this webhook since before this fix existed; the real handler performed only structural JSON validation. This closes that gap for real:

- **Real raw-body capture** (`middleware/raw-body.ts`, new): a custom Fastify JSON content-type parser, behaviorally identical to the default for every other route, additionally stashes the exact raw request bytes on `request`. Required because a real HMAC covers the exact bytes sent — `JSON.stringify(parsedBody)` is not guaranteed to reproduce them.
- **Real secret generation** (`POST /oc/jira/webhook-secret`, Admin.Access-gated): a genuine 256-bit `crypto.randomBytes(32)` secret, stored through the same `SecretProvider` seam as the existing Jira API token, returned in plaintext exactly once.
- **Real verification** (`JiraIntegrationService.verifyWebhookRequest`), Stripe/GitHub-style signing: `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`, sent as `X-AskABD-Webhook-Signature` + `X-AskABD-Webhook-Timestamp`. Checks, in order: secret exists for the environment (fail CLOSED), signature present, timestamp present/numeric/within a 5-minute tolerance window, signature matches via `crypto.timingSafeEqual`, and — real, DB-backed, survives a restart — this exact (environment, signature) pair has never been accepted before (`oc_jira_webhook_deliveries`, `UNIQUE(environment, signature_hash)`).

## A real bug this pass's own tests caught before it shipped

Adding `/api/v1/oc/jira/webhook` to `publicRoutes` (required — a real Jira webhook can never present a bearer token) uses prefix matching. The secret-generation route was originally named `POST /oc/jira/webhook/secret` — nested under the now-public path — which the prefix match silently made public too. Caught immediately by this pass's own RBAC tests (`customer denied` / `unauthenticated denied` both returned 201 instead of 403/401). Fixed by renaming to the sibling path `POST /oc/jira/webhook-secret`. The two pre-existing `publicRoutes` entries (`/oc/invitations/lookup`, `/oc/invitations/accept`) were mechanically checked for the same class of bug — neither has a nested sibling route, so neither was ever exposed to it.

A second real bug, also caught by this pass's own DB-integrity discipline: the test file's original `afterAll` cleanup deleted only the exact base environment string, not the per-scenario sub-environments (`${ENV}-stale`, `${ENV}-replay`, etc.) each test actually used — leaving 45 `oc_jira_integrations` and 3 `oc_jira_webhook_deliveries` rows behind after the first run. Fixed to a `LIKE` prefix match; re-verified zero orphans after the fix.

## Honest production-configuration disclosure

Native Jira Cloud "classic" webhooks cannot compute this signature themselves. `docs/production-connection-readiness.md`'s DEP-014 section is corrected with the real requirement: a Jira Automation rule with a custom-header HMAC expression, or a small relay holding the same secret, must front this endpoint in production. This is disclosed plainly, not glossed over as "fully automatic."

## Security — live proof (Security Testing Addendum)

`apps/api/tests/risk-015-jira-webhook-signature.test.ts`, 14/14 passing:

| Scenario | Result |
|---|---|
| No secret ever generated for an environment | **401 not_configured** (fail closed) |
| Correctly-signed, fresh request | **200**, processed |
| Missing signature header | **401 missing_signature** |
| Missing timestamp header | **401 missing_timestamp** |
| Malformed (non-numeric) timestamp | **401 malformed_timestamp** |
| Stale timestamp (1 hour old, correctly signed for that timestamp) | **401 stale_timestamp** |
| Wrong secret | **401 invalid_signature** |
| Tampered body (signed bytes ≠ sent bytes) | **401 invalid_signature** |
| Exact replay of a previously-accepted request | **401 replayed_request** |
| Old secret used after rotation | **401 invalid_signature** |
| Different byte-ordering of semantically-identical JSON | **401 invalid_signature** (proves raw-byte exactness) |
| `POST /oc/jira/webhook-secret`, customer token | **403** |
| `POST /oc/jira/webhook-secret`, unauthenticated | **401** |
| `POST /oc/jira/webhook-secret`, staff (admin) token | **201**, real 64-hex-char secret |

## Regression

Full suite: **879/879 passing** (865 baseline + 14 new). `tsc --noEmit` clean. Migration 066 applied (`webhook_secret_encrypted` column, `oc_jira_webhook_deliveries` table), verified via direct schema query. Zero orphans confirmed after the test-cleanup fix. Both protected clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unchanged.

## FINAL STATUS: RESOLVED

Real, live-verified, cryptographically-correct webhook signature verification — not a configuration field that's never actually checked. Two real bugs (a public-route prefix-matching footgun that would have exposed secret generation, and a test-cleanup gap) found and fixed by this pass's own testing and DB-integrity discipline before either could reach a shared environment.
