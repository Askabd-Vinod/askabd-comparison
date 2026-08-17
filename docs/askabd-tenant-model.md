# AskABD Tenant Model — User / Organization / Client / Resource

**Date:** 2026-08-17. Answers Phase 4's explicit questions with real evidence from both
repositories' actual schemas — no assumption that `organization = client`.

## The two, currently disconnected, tenancy concepts

```
askabd-identity's world:              askabd-comparison's world:

USER (identity)                        oc_clients
   │ org_context (scalar,                  │ (AskABD's own consulting
   │  1 per identity)                      │  customer companies)
   ▼                                       ▼
ORG_CONTEXT                            SERVICES / CONNECTORS / REQUIREMENTS /
(a string — no Organization             COMMERCIAL ENGAGEMENTS / DOCUMENTS /
 entity table exists)                   AUDIT / etc. (all scoped by client_id)
```

**No code anywhere maps one to the other.** This was established in the prior Identity/Tenant
milestone and re-confirmed this milestone by reading every relevant migration in both
repositories directly.

## Answering Phase 4's exact questions, with evidence

**Can one organization own multiple clients?** No mechanism exists to express this today —
`org_context` is a string on `askabd-identity`'s `identities` table; `oc_clients` in
`askabd-comparison` has no `org_context`/`organization_id` column at all (confirmed by reading
every `oc_*` migration). There is no `organizations` table anywhere that a client could belong
to. This is not "no" as a business answer — it's "the schema has no way to represent it yet."

**Can a user belong to multiple organizations?** **No**, not in the current schema —
`askabd-identity`'s `UNIQUE (org_context, identifier)` constraint plus the scalar `org_context`
column on `identities` means one identity row = exactly one org context. A user needing access to
a second organization would need a second, separate `identities` row (a different `identifier`
uniqueness scope), not a membership relationship.

**Can a user access multiple clients?** In practice, **yes, but only via the `admin`/`super_admin`
role**, per the tenant-access boundary built in the prior milestone
(`apps/api/src/platform/rbac/tenant-access.ts`) — an explicit, documented, coarse-grained
privileged capability, not a per-client grant list. There is no mechanism for a non-admin user to
be scoped to a specific SUBSET of clients (e.g., "this account manager may see clients A and C but
not B") — the only two states available today are "admin: all clients" or "everyone else: no
clients."

**Can a client belong to one organization?** N/A given the above — `oc_clients` has no
organization reference of any kind.

**Can clients be transferred?** N/A — there is no ownership field to transfer.

**Can organization administrators manage multiple clients?** This collapses into the same answer
as "can a user access multiple clients" above, since `askabd-comparison` has no concept of an
"organization administrator" distinct from its own `admin`/`super_admin` roles — those roles are
not organization-scoped, they are platform-wide.

## Why no schema was invented to close these gaps

Per this milestone's explicit instruction ("If a required relationship does not exist, DO NOT
immediately create a schema... If a business decision is genuinely required: document it and
continue unrelated work"): every one of the above is a genuine, unresolved **business decision**,
not a technical gap that has an obviously-correct answer:
- Should `askabd-comparison`'s `oc_clients` gain an `org_context` (or a new `organization_id`)
  column, and if so, is it a 1:1 or many:1 relationship to `askabd-identity` organizations?
- Should `askabd-identity`'s `identities` table move from a scalar `org_context` to a real
  many-to-many `memberships` table (the `@askabd/shared-contracts` `Membership` type already
  exists for exactly this, unused — see `docs/identity-real-contract.md`)?
- Is "admin sees everything, everyone else sees nothing" the intended long-term model, or is a
  finer-grained "this staff member is scoped to clients A and C" model actually wanted?

None of these has a single obviously-correct technical answer inferable from the existing code —
they are product/business decisions. **STOPPED HERE, documented, not invented.** Everything else
in this milestone that does not depend on this decision was completed regardless (see the final
report).

## What IS safely enforced today, regardless of this open question

The tenant-access boundary (prior milestone, re-verified this milestone) already gives a correct,
fail-closed answer for the CURRENT, real state of the schema: since no per-client mapping exists
for any role, only the roles that are DESIGNED to be platform-wide (`admin`/`super_admin`) may
cross client boundaries; everything else is denied. This is not a placeholder pending the business
decision above — it is the objectively correct, safe behavior given what the schema actually
contains right now, and it does not need to be revisited unless the business decision above
introduces a real mapping that should relax it.
