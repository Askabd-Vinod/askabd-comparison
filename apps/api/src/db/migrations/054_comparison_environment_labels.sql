-- Real, dynamic environment display names per comparison run — the
-- "BIDIRECTIONAL COMPARISON UI" directive. Its own core instruction:
-- never show the user internal comparison concepts like "Missing on
-- Left"/"Missing on Right"/"Extra on Right" — the status line must
-- always use the ACTUAL environment names the user selected (e.g.
-- "Missing in Staging", "Missing in Production"), computed dynamically
-- from real data, never hardcoded.
--
-- These two columns capture, at the moment a run is created, the real,
-- formatted environment label for each side (from
-- oc_client_database_connections.environment for a database-schema
-- comparison, or oc_configuration_snapshots.environment for a
-- configuration comparison — see formatEnvironmentLabel() in
-- universal-comparison-engine.ts). Persisting them on the run itself
-- (rather than re-deriving from the connection/snapshot every time the
-- run is read) keeps the run's own displayed wording stable and
-- accurate even if the underlying connection/snapshot is later renamed,
-- re-environmented, or deleted.
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS left_environment TEXT;
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS right_environment TEXT;
