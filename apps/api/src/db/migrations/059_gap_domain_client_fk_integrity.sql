-- Real data-integrity fix found while building the Risk Engine (risk_test_1,
-- 2026-08-24): this session's own standing "verify zero orphan records after
-- every QA cycle" check surfaced 1026 orphaned `oc_gaps` rows (client_id
-- referencing an `oc_clients` row that no longer exists) plus 6/1/56 orphaned
-- rows in `oc_gap_options`/`oc_decisions`/`oc_transformations` respectively.
--
-- Root cause, confirmed by reading migration 037 directly: all 4 tables
-- declare `client_id TEXT NOT NULL` with NO foreign-key reference to
-- `oc_clients(id)` at all — a real, pre-existing gap (not introduced this
-- session) that let many prior sessions' test/QA client deletions silently
-- orphan gap/option/decision/transformation rows instead of either cascading
-- or failing loudly.
--
-- Mechanically audited: the SAME missing-FK pattern (`client_id TEXT NOT
-- NULL,` with no REFERENCES) appears 43 times across 19 migration files —
-- see docs/security-risk-register.md RISK-012 for the full, honest,
-- NOT-fixed-platform-wide disclosure. This migration deliberately fixes only
-- the 4 tables in the Gap/Decision/Transformation domain this pass's own Risk
-- Engine directly links to (`oc_gaps` via `source: 'gaps'`) — closing the one
-- gap actually exercised by new code this pass, not attempting an unrelated,
-- high-risk, platform-wide retrofit in the same commit.

-- Step 1: delete real orphans first (rows whose client_id matches no real
-- oc_clients row) so the new constraint can actually be added. Only
-- `oc_transformations` needs an explicit delete — `oc_gap_options` and
-- `oc_decisions` already CASCADE from `oc_gaps(id)` (see migration 037), so
-- deleting orphaned `oc_gaps` rows cleans those automatically.
DELETE FROM oc_transformations t
  WHERE NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = t.client_id);
DELETE FROM oc_gaps g
  WHERE NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = g.client_id);
-- Belt-and-suspenders: catch any oc_gap_options/oc_decisions rows whose OWN
-- client_id is orphaned even if their gap_id's cascade didn't apply (e.g. a
-- pre-existing data-integrity mismatch between a row's own client_id and its
-- parent gap's client_id).
DELETE FROM oc_gap_options o
  WHERE NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = o.client_id);
DELETE FROM oc_decisions d
  WHERE NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = d.client_id);

-- Step 2: add the real, missing foreign keys, now that no existing row would
-- violate them. ON DELETE CASCADE matches the established convention used by
-- every other client-scoped table this session touched (oc_deployments,
-- oc_risks, test_cases, etc.) — deleting a client is a real, deliberate,
-- already-guarded operation (protected clients are never deleted casually);
-- when a client genuinely is deleted, its gap-domain data should go with it,
-- not be silently orphaned again.
ALTER TABLE oc_gaps
  ADD CONSTRAINT fk_oc_gaps_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_gap_options
  ADD CONSTRAINT fk_oc_gap_options_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_decisions
  ADD CONSTRAINT fk_oc_decisions_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_transformations
  ADD CONSTRAINT fk_oc_transformations_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
