# Final Customer Journey UAT — This Pass's Live Evidence

**Date:** 2026-08-19. The full staff-login → onboarding → invitation → customer-portal
→ discovery-prerequisite journey was driven live in the immediately prior turn (see
`docs/final-adversarial-security-audit.md` §4 and the master status report delivered
then). This document adds the one new end-to-end journey segment this pass drove live:
**incident → remediation → resolution**, for a genuinely fresh client.

## Live sequence actually executed and observed

1. Created a real client (`Bravado Test Client`) via the real API.
2. Created a real incident (`Database connection pool exhausted`, severity `critical`)
   against that client.
3. Navigated to `/clients/{id}/incidents/{id}` in the browser — the real-client branch
   rendered (not the prior generic placeholder): real severity/status/detected-at,
   honest "Not yet determined" root cause, real affected service, real timeline with
   only the one genuine event so far.
4. Clicked **Review Impact — Expedited Mode** → real impact-analysis card rendered
   from the real `oc_remediations.impact_analysis` JSONB.
5. Clicked **Approve & Start Execution** → confirmed via network inspection: real
   `POST .../execute` → `200`, immediately followed by a real `GET` re-fetch (not a
   client-only state flip).
6. Clicked **Start this step →** and **Mark Complete** for all 3 real steps in
   sequence. Observed real, non-fabricated durations after each: `8s`, `9s`, `10s` —
   genuinely the elapsed time between the real start and complete API calls.
7. Panel transitioned to "Awaiting Verification" automatically (server-driven, not
   client-guessed) once the last step completed.
8. Reloaded the page in a fresh navigation — state was identical (server-authoritative,
   not lost, not re-fabricated) — "Awaiting Verification", same 3 steps, same
   durations.
9. Clicked **✓ Verified — Resolved** → **Close Ticket & Mark as Fixed** → real
   `POST .../close` → panel showed "✓ Fixed — Ticket Closed" / "Incident Closed —
   Resolved".
10. Fixtures (client, incident, remediation, operation) deleted by exact ID afterward.

## What this specifically proves

- No browser-only authoritative state: reload mid-flow showed the same real state.
- No fabricated progress: step durations are genuinely measured, not templated.
- No fabricated success: "Ticket Closed" only appears after a real API call the
  operator explicitly triggered.
- Real-time-adjacent UX: the panel polls the real operation while `executing`/
  `validating`, matching the platform's established `OperationProgress` pattern.

## Not re-driven live this pass

Staff login → onboarding → invitation → customer portal → connectors →
discovery-prerequisites was driven live in the immediately preceding turn (same
session) and is not repeated here since no code in that path changed this pass.
Discovery execution, assessment, engineering intelligence, and reporting screens were
not clicked through live this pass — see `docs/final-feature-completeness-matrix.md`
for their carried-forward status.
