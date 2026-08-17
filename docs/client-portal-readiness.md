# Client Portal Readiness (Phase 27)

**Date:** 2026-08-17. Traces the full intended chain — `Website → Identity → Organization →
Client → Client Portal → Assigned Services → Requirements → Connectors → Readiness` — against
what actually exists, link by link, with evidence. Nothing below was implemented speculatively;
each break is documented, not guessed around.

## The chain, traced

| Link | Exists? | Evidence |
|---|---|---|
| `askabd-website` → login | **BROKEN — no link exists** | `grep -rn "identity\.askabd\|login\|signin\|/auth" askabd-website/*.html` → zero matches. The marketing site has no path into any authentication flow at all. |
| Login → `askabd-identity` | **Present, but unreachable from the website** | `askabd-identity`'s `/auth/login` route exists and is real (Argon2id credential check, MFA challenge support, session creation) — it is simply never linked to from anywhere a real customer would click. |
| Identity → Organization | **Exists as a scalar field, not an entity** | `identities.org_context` — see `docs/askabd-tenant-model.md`. A logged-in identity does carry an org context; there is just no `Organization` record with its own attributes (name, plan, billing, etc.) beyond that string. |
| Organization → Client | **BROKEN — no mapping exists** | Confirmed exhaustively in `docs/askabd-tenant-model.md`: `oc_clients` has no organization reference of any kind. Even if a real customer logged into `askabd-identity` successfully today, there would be no way to determine which `oc_clients` row(s) they should see. |
| Client → Client Portal | **Exists as an internal admin console, not a customer-facing portal** | `apps/web`'s `/clients/[clientId]/*` pages are real and extensive (confirmed working throughout this session), but they assume the viewer is an AskABD staff member with DEV-bypass-equivalent access, not an authenticated external customer. `apps/web` sends no `Authorization` header on any request (re-confirmed this milestone by grep — unchanged since the prior two milestones). |
| Client Portal → Assigned Services | **Works, for the internal console** | `GET /oc/clients/:clientId/services` — real, tested, tenant-access-gated (admin/super_admin) as of the prior milestone. |
| → Requirements | **Works, same caveat** | `GET /oc/client-services/:clientId/:serviceId/requirements` — real, service-driven (built in the "Service-Driven Client Onboarding" milestone this session), tenant-access-gated. |
| → Connectors | **Works, same caveat** | Real connector relevance filtering, real (non-fabricated) connection testing (DNS/SMTP/GitHub — built in the "Enterprise Connection Validation" milestone this session), tenant-access-gated for list/get. |
| → Readiness | **Works, same caveat** | `GET /oc/client-services/:clientId/:serviceId/readiness` — real, evidence-based (no fabricated percentages, confirmed in multiple prior milestones' audits). |

## Honest summary

**Everything from "Client → Client Portal" onward is real, tested, and functioning** — this is
the substantial product built across this session's prior milestones (service-driven onboarding,
real connection validation, service governance, tenant isolation). It is not a stub.

**Everything before "Client → Client Portal" is either missing or disconnected** — there is no
live path today for an actual external customer to log in and reach any of it. The application, as
it stands, is correctly understood as an **internal AskABD operations console**, not yet a
customer-facing portal — consistent with the "convert to managed service — remove customer auth"
commit found in an earlier milestone this session, and with the current DEV-bypass-only usage
pattern confirmed by browser UAT throughout.

## What would be required to close this — not implemented, by design

Per this milestone's Phase 27 instruction ("implement only if the architecture supports it
safely; otherwise document the missing integration"), closing this chain requires, in order:
1. The website needs a real login entry point calling `askabd-identity`'s `/auth/login`.
2. `askabd-comparison`'s API needs to be able to verify a real `askabd-identity` token — currently
   impossible (see `docs/identity-real-contract.md`'s Phase 2/3 findings: incompatible signing
   algorithm, no JWKS endpoint, ephemeral unpublished keys).
3. A real organization-to-client mapping needs to be designed and built (see
   `docs/askabd-tenant-model.md`) — a business decision, not a technical one.
4. `apps/web` needs to start sending the real bearer token it receives from a logged-in session
   (currently sends none, by design, per the "remove customer auth" commit).
5. The tenant-access boundary's current "admin/super_admin only" rule would then need to be
   extended with a real per-client grant for the newly-possible non-admin, mapped identities —
   the boundary itself (`tenant-access.ts`) is already built to make this a small, additive change
   once (3) exists, not a rewrite.

None of these five steps was safe to implement unilaterally in this milestone — (2) and (3) are
explicit external/business dependencies this milestone's own stop conditions call out, and (1),
(4), (5) are meaningless to build ahead of (2)/(3) being resolved (they would just create a
login flow that authenticates against a token this API still cannot verify). The correct action
was to document the exact chain and its exact break points, which this document does.
