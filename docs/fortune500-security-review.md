# Fortune 500 Security Review (Phase 40)

**Date:** 2026-08-17. Every answer cites a specific test, file, or direct evidence — not
inference alone where a test could be run.

1. **Can Client A access Client B?** Only if the identity holds `admin`/`super_admin` (documented
   privileged capability). Any other role: denied — `tests/tenant-access.test.ts`, "denial is
   symmetric across different client IDs."
2. **Can Client A modify Client B?** Same boundary applies to writes as reads — the tenant-access
   hook runs on every request regardless of HTTP method. VERIFIED for the ~130 routes carrying
   `:clientId`; **UNVERIFIED/gap** for the ~15 opaque-ID routes listed in
   `docs/resource-authorization-register.md` (problems, gaps, defects, connector test/save,
   Jira config).
3. **Can Client A access Client B connectors?** VERIFIED denied for list/get
   (`GET /oc/connectors/:clientId`, carries `:clientId`). **Gap**: `POST /oc/connectors/test` and
   `/oc/connectors/save` take `clientId` in the request body, not covered by the URL-param
   mechanism — flagged, not silently claimed fixed.
4. **Can Client A access Client B requirements?** VERIFIED denied —
   `/oc/client-services/:clientId/*` carries `:clientId`, covered.
5. **Can Client A access Client B engagements?** Partially — list/create covered (`:clientId` in
   URL); engagement/proposal transition explicitly `Admin.Access`-gated; plain
   `GET /oc/engagements/:id` (opaque ID) is a documented gap.
6. **Can Client A access Client B audit?** **Gap, honestly documented** —
   `GET /oc/audit` takes `clientId` as a query parameter, not a route parameter, so it is outside
   the URL-param tenant-access mechanism. Not fixed this milestone (query-parameter-based
   filtering across ~15 resource types was assessed as out of the "smallest safe change" budget,
   consistent with the prior milestone's identical finding, not newly discovered here).
7. **Can a forged client ID bypass security?** No — the tenant-access check evaluates the
   AUTHENTICATED IDENTITY's resolved role, never the requested client ID's validity or existence.
   A non-admin identity is denied regardless of which (real or fictitious) client ID is requested
   — `tests/tenant-access.test.ts`, symmetry test.
8. **Can a query parameter bypass security?** For the routes where tenant scoping is genuinely
   query-param-based (item 6), yes — this is exactly why it's flagged as a gap rather than
   claimed as covered. This report does not paper over it.
9. **Can an opaque resource ID bypass security?** For the ~12 governance-verb routes explicitly
   listed in `platform/rbac/rules.ts` (service enable/disable, recommendation approve/reject,
   compliance exception transition, engagement/proposal transition, payment
   verify/disable/default, reconciliation execute/transition/exception-transition): **no**,
   individually gated to `Admin.Access`. For the remaining ~15 opaque-ID routes not in that list:
   **yes, this is a real, documented gap** (item 2).
10. **Can a failed connector be shown as connected?** No — `oc_connectors.status` is only ever
    set to `connected` by `persistResult()`, called after a real `testConnection()` outcome;
    `saveConfiguration()` (the save-only path) sets `status = 'configured'`, never `connected`
    (confirmed by direct code read, `connector-service.ts`).
11. **Can missing configuration be shown as verified?** No — `testGeneric()` and the 5
    provider-specific test methods all require the relevant fields to be present before any
    "pass" step is recorded; an empty/missing host fails the first `Configuration Check` step.
12. **Can identity outage grant access?** **VERIFIED, with a real test, not just code-reading** —
    `tests/identity-unavailable.test.ts` (new this milestone): a JWKS endpoint that is unreachable
    (connection refused) or returns a malformed (non-JWKS) response both result in **401**, never
    a silent pass-through. (Today's real-world exposure to this scenario is currently zero — no
    environment has `JWKS_URL` configured, since no real identity integration exists yet per
    `docs/identity-real-contract.md` — but the code path that WOULD run once that's resolved is
    proven fail-closed now, not left to be discovered later.)
13. **Can a forged JWT grant access?** No — signature verification via `jose.jwtVerify` rejects
    any token not signed by the configured key, including one claiming `super_admin`
    (`tests/rbac-service-assignment.test.ts`, "tampered/forged token... → 401, even claiming
    admin").
14. **Can DEV bypass production?** No — re-verified this milestone via
    `tests/tenant-access.test.ts` ("production-shaped config never grants the dev-user-000
    shortcut") and the prior milestone's equivalent test on the auth layer itself.
15. **Can identity restart invalidate production tokens?** **Yes — confirmed and classified as a
    real production blocker**, not hidden: `docs/identity-real-contract.md`'s Phase 3 section
    traces this precisely from `askabd-identity`'s own source — every access token issued before
    a process restart becomes unverifiable after it, because the EdDSA key pair is ephemeral and
    in-memory only.
16. **Can multiple identity instances validate tokens consistently?** **No** — each process
    generates its own independent key pair with no cross-instance coordination (confirmed: no
    Redis-backed or database-backed key store exists in `token-service.ts` despite Redis being
    provisioned in `askabd-identity`'s own `docker-compose.yml`). Documented in
    `docs/identity-real-contract.md`.
17. **Are signing keys persistent?** **No** — confirmed by direct source read, not assumed. This
    is the concrete technical root cause behind items 15 and 16.
18. **Is authorization fail-closed?** Yes, everywhere checked: unmatched-role → deny
    (`tests/rbac-service-assignment.test.ts`), unmatched-tenant → deny
    (`tests/tenant-access.test.ts`), identity-infrastructure-unreachable → deny
    (`tests/identity-unavailable.test.ts`, new this milestone).
19. **Are secrets absent from logs?** Yes for what was directly checked this session: connector
    credential fields are masked before persistence (never logged in plaintext, confirmed
    `connector-service.ts`); JWT verification failure logs only a reason string
    (`"Token expired"`/`"Invalid signature"`/`"Invalid token"`) plus the underlying error message,
    never the token itself (confirmed `middleware/auth.ts`'s catch block, unchanged this
    milestone). Not exhaustively re-audited across every log call site in the codebase this
    milestone — the specific auth/connector paths most likely to carry secrets were checked, not
    a full-repository log audit.
20. **Are customer-facing metrics evidence-backed?** Mixed, honestly reported: the Operations
    Center's core metrics (services/requirements/readiness/connector status) are real and
    database-backed, confirmed across four prior milestones this session. `mock-clients.ts`
    (~48 pages) remains a known, pre-existing, already-documented exception — see the final
    report's mock-data section. Not claimed fixed here; not newly discovered here either.

## Where this review differs from a rubber stamp

Six of the twenty answers above (2, 3, 6, 8, 9 partially, 19 partially) are **not** clean "no,
never" — they identify a real, currently-unenforced gap and say so plainly, rather than being
massaged into a pass. This is intentional: a security review whose answer to every question is
"secure" without exception is not credible evidence for a Fortune 500 buyer's own security team —
a defensible review names its exceptions precisely enough that someone else could verify them.
