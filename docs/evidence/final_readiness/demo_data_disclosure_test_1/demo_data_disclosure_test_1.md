# demo_data_disclosure_test_1 — closing an undisclosed-fabrication gap (Phase 35, Final Master Completion Directive)

**Directive**: "ASKABD — FINAL MASTER COMPLETION, VERIFICATION & PRODUCTION
READINESS DIRECTIVE", Phase 35 ("No Fabrication") and Phase 18 ("UI/UX
Master Audit — misleading labels").
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## What was found

A repository-wide mechanical sweep for `mockClients` usage (Phase 35's own
explicit instruction) found 39 files importing the fabricated sample-client
dataset (`apps/web/src/app/lib/mock-clients.ts`, 8 hand-written demo
companies with fake financials, timestamps, and metrics). A pre-existing,
already-correct disclosure pattern exists for this exact situation
(`<DemoDataBanner />`, added in an earlier pass — see its own doc comment:
*"an audit of this page found every headline number computed from
fabricated data with no indication to the viewer... the honest fix is to
say so plainly"*) and was already applied to every TOP-LEVEL aggregate
dashboard (`governance`, `intelligence`, `monitoring`, etc.) — but **24 of
the 25 client-scoped demo pages under `clients/[clientId]/*` had never
received it**, despite rendering from the exact same fabricated dataset.

## Why this matters

Each of these 24 pages only ever renders its mock branch for one of the 8
hardcoded demo client IDs (`meridian-financial`, `nexus-healthcare`, etc.)
— real, database-backed clients (UUID ids, created via the real onboarding
wizard) always take the separate, real-data branch (confirmed by reading
every file's own `if (!client) return <RealComponent/>` / `<CapabilityPlaceholder/>`
routing logic — no ID collision is possible between an 8-item hardcoded
slug list and a generated UUID). **So this was never a risk of a real
client's numbers being replaced by fake ones** — but it was a real,
undisclosed honesty gap: anyone viewing one of the 8 demo clients' Alerts,
Applications, Automation, Capabilities, Consulting, Contacts, Contracts,
Documents, Edit, Environments, Infrastructure, Knowledge, Monitoring,
Overview, Performance, Settings, Support, Timeline, or Usage page saw
entirely fabricated figures with zero indication, while the platform's own
top-level dashboards for the identical dataset already disclosed it. This
is exactly the inconsistency Phase 35 exists to catch.

## Fix

Added `<DemoDataBanner />` (the existing, unmodified, already-live
component) as the first rendered element in the mock/demo branch of all 24
files:

`page.tsx` (client overview), `alerts/page.tsx`, `alerts/[alertId]/page.tsx`,
`applications/page.tsx`, `applications/[appId]/page.tsx`,
`audit/[auditId]/page.tsx`, `automation/page.tsx`, `capabilities/page.tsx`,
`consulting/page.tsx`, `contacts/page.tsx`, `contracts/page.tsx`,
`documents/page.tsx`, `edit/page.tsx`, `environments/page.tsx`,
`environments/[envName]/page.tsx`, `infrastructure/page.tsx`,
`infrastructure/servers/[serverId]/page.tsx`, `knowledge/page.tsx`,
`monitoring/page.tsx`, `performance/page.tsx`, `settings/page.tsx`,
`support/page.tsx`, `timeline/page.tsx`, `usage/page.tsx`.

`search/page.tsx` was deliberately left unchanged — it already labels each
individual search result `source: 'real' | 'demo'` inline, a finer-grained
and more accurate disclosure than a page-level banner would be (a banner
would incorrectly imply the whole page is demo data, when results are
genuinely hybrid).

For the 3 files whose demo branch returns a single child component
directly (`contracts`, `documents`, `usage` — `return <XView .../>`), the
banner was added as a sibling via a fragment (`return <><DemoDataBanner /><XView .../></>;`)
rather than modifying the child component itself.

## Verification

- `tsc --noEmit` clean on `apps/web` after all 24 edits.
- **Full production build succeeded** (`next build`): all 45 route groups
  compiled and generated without error, including the new
  `/platform/verification/journeys/[runId]` route from this same pass —
  first real production-build verification this session (previously only
  `tsc --noEmit` had been run, not a full build).
- Mechanical re-check: `grep -rL "DemoDataBanner" <files-importing-mockClients>`
  now returns exactly one file (`search/page.tsx`, deliberately excluded
  per above) — zero undisclosed demo-data pages remain.
- Live browser click-through of a demo client page was attempted but the
  staff session (found already active earlier this session) had expired
  by this point — `BLOCKED_EXTERNAL_AUTH`, honestly disclosed, not
  fabricated. The component itself is not new — it is already proven live
  and working on every top-level dashboard page (see prior evidence docs).
  Confidence is high (successful build + identical, already-proven
  component + identical insertion pattern used 24 times) but this specific
  rollout's own live rendering is not independently re-confirmed this
  pass.
- API (`localhost:4200`) and Identity (`localhost:3100`) dev servers were
  found stopped after the build (unrelated background process
  cycling, not caused by these edits) — restarted and re-verified healthy
  (`{"status":"ok",...,"database":"connected"}` and `{"status":"ok",...}`
  respectively) before this evidence doc was finalized. `localhost:3001`
  (web) remained healthy throughout.

## Scope note

This fix addresses the disclosure gap, not the underlying architecture —
the client-scoped demo pages remain backed by static fabricated data by
design (they are illustrative "what the platform looks like" pages for 8
named sample companies, never real client data). Wiring all 24 to real
per-client aggregation APIs the way `deployments/page.tsx`,
`contacts/page.tsx`, and `documents/page.tsx`'s real branches already are
remains a large, separate body of work, tracked honestly in
`docs/enterprise-feature-gap-register.md` rather than silently implied
complete by this pass.
