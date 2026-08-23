-- "Comparison semantics must be ENVIRONMENT-AWARE, not LEFT/RIGHT-AWARE"
-- correction. Two real changes:
--
-- 1. Persist a real, stable environment IDENTITY alongside the already-
--    persisted formatted display NAME, per the user's own explicit field
--    naming (leftEnvironmentId/leftEnvironmentName). This platform has no
--    separate normalized "Environment" entity with its own generated ID
--    (the Environments tab is keyed by the same raw slug stored on each
--    connection/snapshot's own `environment` column) — so "Id" here is
--    honestly realized as that real, already-persisted raw slug itself
--    (e.g. 'production', 'staging'), a real stable identifier distinct
--    from its formatted display Name ('Production', 'Staging'). A real,
--    disclosed fast-follow if/when a normalized Environment entity with
--    its own database-generated id is introduced.
-- 2. Renames the migration-054 columns from the generic `left_environment`/
--    `right_environment` to `left_environment_name`/`right_environment_name`
--    to match this naming exactly, and adds the new `*_environment_id`
--    columns alongside them.
ALTER TABLE comparison_runs RENAME COLUMN left_environment TO left_environment_name;
ALTER TABLE comparison_runs RENAME COLUMN right_environment TO right_environment_name;
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS left_environment_id TEXT;
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS right_environment_id TEXT;
