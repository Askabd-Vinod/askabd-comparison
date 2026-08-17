# "Authentication Missing" — P0 Investigation

**Date:** 2026-08-17. This document traces the notification to its exact, evidenced source
rather than assuming its meaning, per the explicit instruction not to guess.

## What was checked

1. Literal string search (`Authentication missing`, `authentication_missing`, `AUTH_MISSING`,
   case-insensitive) across `askabd-comparison`'s and `askabd-identity`'s source trees: **zero
   matches anywhere in application code.**
2. Live browser console on the running web app: zero matching log/error/warning.
3. `/health`, `/ready`, `/metrics` on the running API: no such field or message; `/metrics`
   shows `errors.authFailures: 0`, `errors.authzDenials: 0`.
4. Presence of any login/signin UI in `apps/web`: **zero files** (`find ... -iname "*login*" -o
   -iname "*signin*" -o -iname "*auth*"` → no matches under `src/`).

## Where the condition actually originates — two real, existing, honest diagnostics

**A. `GET /platform/startup`** (a one-time startup diagnostic, not shown on the main dashboard):

```json
{"name": "JWT Configuration", "status": "warn",
 "message": "No JWT configured — dev bypass active",
 "fix": "Set JWT_SECRET or JWKS_URL", "required": false}
```

This is the **only** warning among 17 checks (15 pass, 1 warn, 1 skip). It drags this endpoint's
`readiness.security` sub-score to exactly **50/100** (overall 92/100). This is a real,
already-existing, correct diagnostic — not a bug.

**B. `GET /platform/production-readiness`** (rendered in the web app at
`/platform/production-readiness`, confirmed live via browser navigation this milestone):

```
JWT Authentication  [READY TO CONNECT]
Category: Security
Have: DEV bypass (no JWT_SECRET)
Need: JWT_SECRET (min 32 chars)
```

This page explicitly, honestly states the current state as "DEV bypass (no JWT_SECRET)" under a
list of 18 production dependencies — 1 verified, 17 "ready to connect" (not yet configured for
production), 0 blocking. A person or tool reading this page's content would very reasonably
summarize it as "authentication [is] missing [for production]."

**What it is NOT:** the dashboard's "Platform Health: unhealthy" widget (`/platform/health`) is
a *different* endpoint entirely, and its "unhealthy" status is caused by **heap memory usage
(92%)**, not authentication — that same endpoint explicitly reports
`"Security Health": "healthy", score: 100, "authentication": "healthy — JWT middleware active"`.
Confirmed by direct API read; this rules out the dashboard's headline health widget as the
source, avoiding a false lead.

## Classification against the 15 candidate meanings

**Primary: B + M.** "**B** — Login UI does not exist" (confirmed, zero files) combined with
"**M** — DEV bypass is masking what would be a real production authentication problem" (confirmed:
both diagnostics above exist specifically to surface this, and do so correctly). This is not a
defect — it is the platform truthfully reporting its own DEV-mode state, exactly as a Fortune
500-grade system should. Ruled out: **N** (frontend displaying it incorrectly — the two sources
found are accurate, not mislabeled); **G/H** (API cannot reach or is incompatible with
`askabd-identity` — true per `docs/identity-real-contract.md`, but not what either diagnostic
message is about — both concern *local* JWT_SECRET/JWKS_URL configuration, a step logically prior
to ever reaching `askabd-identity` at all).

**Possible but unconfirmable from this environment:** if the "notification" the user received was
a literal OS-level or Claude-Code-tooling notification (distinct from anything inside the AskABD
application), this investigation has no visibility into that channel and does not claim to. Per
the explicit instruction to name the exact source rather than force a single answer: the strongest
evidence-backed answer is the two application diagnostics above; anything outside the application
is out of this investigation's reach.

## Why this is not "fixed" by changing a message

Per the explicit instruction ("if it is a false-positive notification: fix the detection logic
rather than hiding the notification"): **this is not a false positive.** `JWT_SECRET` genuinely is
not configured in this development environment, and DEV bypass genuinely is active — both
diagnostics say exactly true things. Silencing or softening either message would make the
platform less honest, not more correct, and would directly contradict this whole session's
established "no fake success" principle.

## What WAS a real, safe, fixable gap — fixed this milestone

Investigating the full authentication chain (per 0C/0G) surfaced one genuine defect, unrelated to
DEV/test behavior: **`deploy/k8s/api-deployment.yaml`, the Kubernetes production deployment
manifest, never wired `JWT_SECRET` (or `JWKS_URL`) as an environment variable at all** — only
`DATABASE_URL` was sourced from a Secret. This meant that even a fully-intentioned production
operator following `docs/identity-production-requirements.md` and setting a real `JWT_SECRET`
value would have had no way to actually get it into the running container — the manifest itself
had no place for it. Note this is a **configuration gap, not a security hole**: with no key
configured, `NODE_ENV=production` still correctly forces DEV bypass off and every authenticated
request fails closed with 401 (never open) — but authentication would have been entirely unusable
in that deployment path, silently, until someone happened to add the missing wiring.

**Fixed:**
- `deploy/k8s/secrets.yaml` — added a `jwt-secret` key (placeholder value `CHANGE_ME`, matching
  the existing `database-url` placeholder pattern exactly — no real secret introduced).
- `deploy/k8s/api-deployment.yaml` — added a `JWT_SECRET` environment variable sourced from that
  key, matching the existing `DATABASE_URL` `secretKeyRef` pattern exactly.

This closes the one concrete, safely-fixable gap this investigation found. It does **not** resolve
the deeper P0 (`docs/identity-real-contract.md`: even a correctly-supplied `JWT_SECRET` cannot
verify a real `askabd-identity` token today, since that service signs with EdDSA, not HS256) —
this fix makes the *local* configuration path complete and correct; it does not and cannot fix an
incompatibility in a different repository.

## Auth error UX — additive improvement made this milestone

Per the explicit spec in the master milestone's Phase 0E (distinct messages for
`NOT_AUTHENTICATED`/`TOKEN_EXPIRED`/`INVALID_TOKEN`/`FORBIDDEN`/`TENANT_NOT_RESOLVED`), the API's
401/403 responses previously returned the same generic message regardless of cause. Added a safe,
stable, non-leaking `reasonCode` field (`not_authenticated` / `token_expired` / `invalid_token` /
`forbidden` / `tenant_not_resolved`) to every relevant error response, so a real future login flow
can render the exact right message without guessing — proven with 7 new tests
(`tests/auth-error-ux.test.ts`), including an explicit assertion that no 401 body ever contains
the word "signature" (why exactly a forged token failed is never revealed) or the submitted token
value itself.

## The customer-login question — a business decision, not re-litigated here

0D asks whether a real customer can log in, be resolved to an organization, and see only their
clients. The honest answer, evidenced in `docs/client-portal-readiness.md`, is **no** — and this
is the DIRECT, INTENDED result of a deliberate, explicit, already-documented business decision:

> commit `2c288ff`, "feat(web): convert to managed service — remove customer auth,
> comparison-first home": *"AskABD is a managed digital services company, NOT a self-service SaaS.
> Clients request services. No public authentication needed."*

Building a new customer-facing login flow now would **reverse this documented decision**, not
implement a missing feature. This is exactly the kind of fork this session's own rules require
stopping and documenting rather than silently acting on: **a real business decision is needed**
—does AskABD want to re-introduce customer self-service login, or does the "managed service, no
customer auth" model remain intentional? Nothing was built toward reversing it without that
confirmation. Everything else safely completable was completed regardless (see the checklist
below).
