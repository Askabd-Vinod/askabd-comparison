-- Migration 022: Add version column to oc_lifecycle for optimistic locking
-- This column is already present in the running database (added during development).
-- This migration ensures fresh deployments create the column correctly.

ALTER TABLE oc_lifecycle ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Ensure any existing rows without version get a sensible default
UPDATE oc_lifecycle SET version = 1 WHERE version IS NULL;
