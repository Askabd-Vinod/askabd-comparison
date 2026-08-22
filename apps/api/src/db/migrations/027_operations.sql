-- The single, reusable, real-time Operation/Job model — the authoritative source for
-- ANY long-running process (migration execution, discovery scans, assessments, future
-- imports/exports/synchronization). Before this migration, each of these had its own,
-- separate, blocking, request/response-only implementation with no shared abstraction:
-- oc_migration_runs (migration 021... no, migration_execution_service.ts's own
-- CREATE TABLE) and oc_discovery_runs (migration 007) each independently tracked
-- status/started_at/completed_at/evidence with no common "progress" concept and, more
-- importantly, NO asynchronous execution model at all — the entire operation ran
-- synchronously inside one HTTP request, so no genuine mid-flight progress could ever
-- be observed by a client regardless of how long the operation actually took.
--
-- This table does not replace oc_migration_runs/oc_discovery_runs/oc_assessments (they
-- remain the authoritative store for each operation TYPE's own rich, type-specific
-- result data — steps, resources, findings). oc_operations is the thin, generic layer
-- OVER them: one row per real, in-progress-or-finished unit of work, with a uniform
-- progress/status/timestamp/error shape any operation type can report into and any
-- frontend component can poll — "one authoritative operation model," per the explicit
-- instruction not to build a separate progress system per operation type.
CREATE TABLE IF NOT EXISTS oc_operations (
  id TEXT PRIMARY KEY DEFAULT 'op-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  -- 'migration' | 'discovery' | 'assessment' | future types — never validated by a DB
  -- constraint (matches the same pattern as staff_role_assignment.role above): the
  -- vocabulary lives in application code (operation-service.ts), single source of truth.
  type TEXT NOT NULL,
  -- The type-specific row this operation is reporting progress for (e.g. an
  -- oc_migration_runs.id or oc_discovery_runs.id) — lets the UI deep-link to the full,
  -- rich, type-specific evidence once the operation completes. Nullable: an operation
  -- can exist before its type-specific detail row is created.
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
  current_stage TEXT,
  total_units INTEGER,
  completed_units INTEGER NOT NULL DEFAULT 0,
  failed_units INTEGER NOT NULL DEFAULT 0,
  warning_units INTEGER NOT NULL DEFAULT 0,
  -- Real percentage only when total_units is known and > 0 — the service layer leaves
  -- this NULL (never a fabricated 0 or guessed value) when progress genuinely cannot
  -- yet be calculated; the frontend renders "Progress not available" in that case.
  progress_percent INTEGER,
  error_summary TEXT,
  -- Real, append-only evidence log — one honest, timestamped entry per real thing that
  -- actually happened (never backfilled or invented after the fact).
  evidence JSONB NOT NULL DEFAULT '[]',
  result JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  cancellable BOOLEAN NOT NULL DEFAULT false,
  retryable BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_oc_operations_client ON oc_operations(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_operations_status ON oc_operations(status);
CREATE INDEX IF NOT EXISTS idx_oc_operations_type ON oc_operations(type);
-- Fast lookup for the startup-recovery sweep (see operation-service.ts's
-- recoverInterruptedOperations()) — real rows genuinely stuck in 'running' from a
-- process that no longer exists.
CREATE INDEX IF NOT EXISTS idx_oc_operations_running ON oc_operations(status) WHERE status = 'running';
