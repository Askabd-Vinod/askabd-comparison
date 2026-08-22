# Client Requirements Matrix

**Date:** 2026-08-18. What information is genuinely required from a customer at each
stage this session touched, who owns providing it, and why. Pre-existing
service-driven requirements (`ServiceRequirementMatrixService`, from an earlier
milestone) are referenced, not duplicated — this document covers only the NEW
requirement surface this session added: invitation acceptance.

| Requirement | Required? | Owner | Why AskABD needs it | What happens after | Protection |
|---|---|---|---|---|---|
| Organization (org_context) | Required, chosen by AskABD admin at invite time | AskABD Admin | Determines which real askabd-identity organization the new identity is created under, and which mapping is granted. | Stored on the invitation row; used verbatim to create the real identity and the real mapping — never guessed from the customer's email domain. | Not secret — visible to the inviting admin and recorded in the invitation and audit log. |
| Email | Required | AskABD Admin (at invite) / implicitly confirmed by the customer (by receiving and clicking the email) | Becomes the real askabd-identity `identifier` (login username). | A real, single-use invitation link is sent to it via the real EmailService. | Never displayed back except to the invitee themselves on the accept page. |
| Password | Required | Customer (at accept) | Becomes the real askabd-identity credential. | Verified against askabd-identity's real complexity rules (`credential/store`); on success, immediately used for a real login. | Never stored, logged, or returned by any API response — only sent once, over HTTPS in production, to askabd-identity's own `/credential/store` endpoint. |

## Why an "Organization ID" field on the login/accept pages, not something friendlier

askabd-identity's real login contract requires an `X-Org-Context` header (see
`docs/identity-token-contract.md`) — there is no code anywhere in either repository
that infers a customer's organization from their email domain or any other signal.
Asking for it explicitly is the honest reflection of what the platform actually knows
today, not a design preference. A friendlier flow (subdomain-per-organization,
email-domain inference, or an organization directory lookup) would require either a
new askabd-identity capability or a new askabd-comparison lookup table — a genuine
product decision, not invented here.

## Pre-existing, untouched requirement matrix (service-driven onboarding)

`ServiceRequirementMatrixService` (earlier milestone) already implements the
"show only what's relevant to the client's confirmed services" principle this brief
asks for — see `GET /oc/clients/:clientId/onboarding/requirements` and
`docs/enterprise-connection-validation-report.md`. Not re-verified or extended this
session.
