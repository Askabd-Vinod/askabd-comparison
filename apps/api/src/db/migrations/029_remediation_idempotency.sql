-- Real fix for a real race found live: findOrCreateRemediation's original
-- "INSERT ... WHERE NOT EXISTS" is NOT safe under Postgres's default READ COMMITTED
-- isolation — two concurrent transactions can both evaluate the subquery against a
-- snapshot that shows neither's insert yet, and both proceed to insert. A partial
-- unique index makes Postgres itself the enforcement point: at most one non-terminal
-- (not completed/rolled-back/failed) remediation may exist per incident, regardless
-- of how many requests race to create one. A concurrent INSERT that would violate
-- this is rejected by Postgres directly, not by application logic that can race
-- against itself.
CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_remediations_one_open_per_incident
  ON oc_remediations (incident_id)
  WHERE phase NOT IN ('completed', 'rolled-back', 'failed');
