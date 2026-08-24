# requirements_clarification_test_1 — Requirements Clarification Engine: real questions from an existing, unmodified classifier

**Feature under test**: `RequirementsClarificationEngine` (new) + `requirements-clarification-routes.ts` (new) — real, specific question generation from real requirement-quality findings.
**Test Suite**: `requirements_clarification_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — MASTER AUTONOMOUS COMPLETION DIRECTIVE, capability #14)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Closing an already-precisely-named gap

The coverage matrix's own prior note for row #14 named the exact gap: "classifier says which fields are missing, never generates the specific questions a human analyst would ask." This pass reused `business-requirements-service.ts`'s existing, unmodified, real, rule-based `classifyQuality()` (and its real, persisted `quality_findings`) entirely as-is — this engine does not re-detect missing/ambiguous/duplicate requirements; it only turns a real, already-computed finding into a real, specific, answerable question.

## Real, deterministic question generation — never AI-fabricated

`MISSING_FIELD_QUESTIONS` maps each specific real missing-field name (parsed directly out of the classifier's own real `"Missing: field1, field2"` message) to a real, specific question — e.g. missing "acceptance criteria" produces *"What are the specific, measurable acceptance criteria for this requirement? (e.g. 'Given X, when Y, then Z')"*, not a generic "please clarify." `duplicate_title` and `vague_unmeasurable_language` findings get their own real, distinct question templates. Any other/future finding rule with no template is honestly NOT generated — never a generic fallback question that could misrepresent what the classifier actually found.

Proven live: a genuinely incomplete requirement (classifier correctly returns `qualityStatus: 'incomplete'`) produces real, specific questions per missing field; a genuinely COMPLETE requirement produces zero clarifications — never a fabricated question for a real non-finding.

## Real, enforced no-duplication

Re-running generation for the same requirement never creates a second open question for a finding that already has one open — proven live (second generation call returns 0 new clarifications).

## Real, never-invented client answer

`recordClientAnswer` requires a real, non-empty answer and stores it verbatim — proven live, matching the directive's own explicit "never invent the client's answer." `resolve` requires the clarification to genuinely be in `answered` status first (never resolves an unanswered question) and a real resolution note.

## Staff-vs-portal split — the client is the one who answers

Matches the established `client-requests-routes.ts` pattern: staff generates/manages clarifications (Admin.Access), while the real customer portal (tenant-access.ts's real membership check) is where the client reads and answers their own real questions — proven live with a genuinely mapped customer identity reading and answering over real HTTP, and a genuinely unrelated client denied (403) access to another client's clarifications.

## Security — RBAC + tenant isolation + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated (staff route) | **401** |
| Customer token on staff route (insufficient role) | **403** |
| Staff (admin) | **200/201** |
| A genuinely mapped client, portal route, own clarification | **200**, real read + real answer |
| An unrelated client, portal route, another client's clarifications | **403** (tenant isolation) |
| Malformed/SQL-injection-shaped clarification id | **404**, safe, no leaked SQL error text |
| Empty-body POST to answer/resolve/wont-fix | Safe `<500` |

## Automated tests — 13 new, all real, none stubbed

`apps/api/tests/requirements-clarification-test-1.test.ts`: real question generation per missing field, no-duplicate re-generation, zero clarifications for a genuinely complete requirement, real answer requirement, resolve-requires-answered, full object-level ownership sweep, and 7 HTTP/RBAC/tenant-isolation tests.

Full local run: **13/13 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged. No dedicated staff UI yet; the real portal read+answer flow is API-only this pass on both sides.

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing (zero duplication of the existing classifier), security-audited question generation with a genuine never-invented-answer discipline. Capped below PASS only because no dedicated UI exists yet and Playwright remains `BLOCKED_EXTERNAL_AUTH`.
