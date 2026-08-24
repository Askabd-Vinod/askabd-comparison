-- Executive Reporting Engine (executive_reporting_test_1, 2026-08-24
-- master completion directive, capability #62). Genuinely NEW — confirmed
-- row #61's existing `TestReportService`/`SecurityReportService` are
-- real but scoped to testing/security specifically; no cross-domain
-- executive summary existed. This engine is a real, read-only
-- AGGREGATOR over already-real data from every engine this session
-- built/verified (requirements, gaps, risks, compliance, testing, UAT,
-- deployments, changes) — it computes nothing new about any single
-- domain, and duplicates no domain's own business logic.
CREATE TABLE IF NOT EXISTS oc_executive_reports (
  id TEXT PRIMARY KEY DEFAULT ('exrep-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  report JSONB NOT NULL,
  generated_by TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_executive_reports_client ON oc_executive_reports(client_id);
