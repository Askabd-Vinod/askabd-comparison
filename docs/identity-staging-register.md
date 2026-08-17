# Identity — Staging Readiness Register

Placeholders only. No secret is present or requested to be placed in source files — every value
below must be provided via the deployment environment's secret-injection mechanism (e.g. a
secrets manager, CI/CD masked variable, or orchestrator secret store), never committed.

```
IDENTITY_PROVIDER_URL:
<REQUIRED — staging base URL for askabd-identity, e.g. https://identity-staging.askabd.app>

JWKS_URL:
<BLOCKED — does not exist yet on the identity service; see docs/identity-token-contract.md.
 Cannot be filled in until the identity team adds this endpoint.>

JWT_ISSUER:
askabd-identity   (already correct default, no staging-specific value needed)

JWT_AUDIENCE:
<NOT APPLICABLE — leave unset; see docs/identity-production-requirements.md>

STAGING_ADMIN_USER:
<REQUIRED — an askabd-identity identity, in staging's askabd-identity database, provisioned
 with a role/permission-check outcome of "allow" for the Operations Center Admin.Access-gated
 actions this API needs to test. Per the confirmed Phase 2 mismatch, this requires the
 identity/comparison integration to actually exist first (JWKS or remote policy-check) —
 requesting this account is a downstream step, not something to provision today.>

STAGING_CUSTOMER_USER:
<REQUIRED — same caveat as above, provisioned with no elevated role, used to exercise the
 negative security tests (403 on Admin.Access routes, 403 on tenant-access-gated routes) against
 a real signed token rather than this repository's self-signed test tokens.>

STAGING_TEST_CLIENT_A:
<REQUIRED — a real oc_clients row in the staging database, used as the "own client" side of
 cross-tenant tests>

STAGING_TEST_CLIENT_B:
<REQUIRED — a second real oc_clients row, used as the "other client" side of cross-tenant
 tests, to prove STAGING_CUSTOMER_USER (or any non-admin identity, once a real per-client
 mapping exists) cannot read/write client B's data>
```

## Why this register cannot be completed today

Every entry above is downstream of the Phase 2 finding in
`docs/identity-token-contract.md`: this API cannot currently verify a real
`askabd-identity`-issued token at all (no compatible signing mechanism configured on either
side), so there is no way to test against real staging identities yet, regardless of which
specific accounts are provisioned. Provisioning `STAGING_ADMIN_USER`/`STAGING_CUSTOMER_USER`
before that is resolved would produce accounts this API cannot authenticate — not a meaningful
readiness step. The register is documented in full now so it is ready to execute the moment the
underlying integration exists.
