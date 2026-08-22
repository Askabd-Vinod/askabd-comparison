# CRM Completeness

**Date:** 2026-08-19. Real, database-backed CRM built this pass: Contacts,
Notes, Tasks — previously entirely MISSING (the "Contacts" page showed
fabricated, identical-shape sample data for every client; there was no Notes
or Tasks capability at all).

## What's COMPLETE

| Capability | Database | Service | API | RBAC | Tenant scope | Audit | UI | Tests | Browser-verified |
|---|---|---|---|---|---|---|---|---|---|
| Contacts | `oc_contacts` (migration 030) | `crm-service.ts` | `crm-routes.ts` | `Admin.Access` | via `:clientId` (tenant-access.ts) | `oc_audit_log` | `/clients/:id/contacts` | 4 (`crm-routes.test.ts`) | ✓ create/list/deactivate |
| Notes | `oc_client_notes` | `crm-service.ts` | `crm-routes.ts` | `Admin.Access` | via `:clientId` | `oc_audit_log` | `/clients/:id/notes` | 3 | ✓ create/archive |
| Tasks | `oc_client_tasks` | `crm-service.ts` | `crm-routes.ts` | `Admin.Access` | via `:clientId` | `oc_audit_log` | `/clients/:id/tasks` | 3 | ✓ create/status transitions |

All three: real create, real list, real state transitions (contact
active↔inactive, note archived, task open→in_progress→completed/cancelled),
real author/actor attribution from the verified JWT (never client-supplied),
real timestamps, real per-row persistence proven via direct DB queries during
testing — none of this is `mockClients`-derived or fabricated.

## Customer visibility — now built (2026-08-19 update, migration 031)

Resolved with the safest useful split, per the explicit direction to default
unknowns to internal rather than invent broad customer access: every
Contact/Note/Task now carries a real `visibility` field — `'internal'`
(staff-only) or `'customer'` — **defaulting to `'internal'`**. Nothing is
ever customer-visible unless a real staff member explicitly checks the
"Visible to the customer" box when creating or editing it.

- **Staff management routes** (`/oc/clients/:clientId/contacts|notes|tasks`,
  `/oc/contacts|notes|tasks/:id`) — unchanged: full CRUD, `Admin.Access`-gated,
  staff-only, can set/change visibility on any record.
- **Real customer-portal read routes**
  (`/oc/portal/:clientId/contacts|notes|tasks`) — the *only* path a customer
  session ever uses. Filters `visibility = 'customer'` at the SQL query level
  (`crm-service.ts`'s `listCustomerVisible*`), not a client-side filter a
  customer's own browser could bypass. Tenant-scoped the same way every other
  `/oc/portal/:clientId/*` route already is.
- **Client portal UI**: a new "Team & Notes" tab shows only what's been
  explicitly shared — contacts, notes, and action items.
- **3 new automated tests** prove: new records default to internal; the
  customer-portal routes return only customer-marked records, never internal
  ones (created one of each, side by side, in the same client); and a real,
  genuinely-mapped customer identity can read the shared note while a
  different, unmapped org is denied entirely (403) — real tenant isolation,
  not assumed.

**Why this specific split**: it directly follows the "default to INTERNAL
where no rule exists" instruction — no field is exposed unless a human
explicitly opts it in, for every one of the three record types, rather than
guessing per-type policies (e.g. "tasks are customer-visible by default" would
have been an invented business rule).

## What was explicitly NOT built this pass (and why)

- **Contact "history"/interaction log beyond the audit trail** — `oc_audit_log`
  already captures every contact/note/task mutation with who/what/when; a
  dedicated aggregated "Activities" UI view was not built (same reasoning as
  the CRM section of `docs/final-feature-completeness-matrix.md`'s earlier
  pass — `oc_audit_log` + `oc_notifications` already provide the real,
  factual data; a purpose-built aggregation view is a UI investment, not a
  missing capability).
- **@mentions/notifications on notes or task assignment** — no notification
  fires today when a task is assigned or a note is added. Real
  `oc_notifications` infrastructure exists elsewhere in the platform; wiring
  it here is a small, real follow-up, not done this pass to keep this
  specific change reviewable.
- **Contact↔`client_identity_mapping` linkage** — a CRM "contact" and a real
  portal login (`client_identity_mapping`) are deliberately separate concepts
  here (a contact is a person record; a mapping is an authorization grant). No
  UI or API currently links a contact row to the identity that might use that
  same email to log in. This is consistent with treating CRM contacts as
  relationship-management data, not an identity/access record — but is worth
  a future decision if "invite this contact to the portal" becomes a real
  requirement.

## Verification performed this pass

- 10 new automated tests (`apps/api/tests/crm-routes.test.ts`): real
  create/list/deactivate/archive/status-transition behavior, RBAC denial for
  a real customer token (403), unauthenticated denial (401), empty-input
  rejection (400), author-is-the-real-identity (never client-supplied).
- Live browser UAT against the real preserved `AskABD Manual UAT 2026`
  client: created a real contact, a real note, a real task; completed the
  task through its real status state machine; confirmed persistence via page
  reload.
