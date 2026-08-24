-- Migration 067: RISK-012 platform-wide fix — real missing client_id foreign
-- keys added to the remaining 39 tables disclosed in migration 059's own
-- comment (docs/security-risk-register.md RISK-012). Migration 059 fixed the
-- 4 tables in the Gap/Decision/Transformation domain the Risk Engine directly
-- touched; this migration completes the platform-wide fix for the other 18
-- migration files' worth of tables, using the exact same two-step pattern
-- that migration 059 already proved works cleanly: (1) delete real orphaned
-- rows (client_id referencing an oc_clients row that no longer exists), then
-- (2) add the missing FK with ON DELETE CASCADE.
--
-- Real orphan counts confirmed by direct query BEFORE writing this migration
-- (see risk_012_platform_fk_integrity_test_1 evidence for the full table):
-- the accumulation is large — oc_client_service_requirements alone had 21,681
-- orphaned rows out of 21,761 total (99.6%), oc_events had 16,439 of 16,462
-- (99.9%) — real, historical test/QA client-deletion fallout accumulated
-- across many prior sessions, not introduced by this migration. Both real
-- protected clients (`AskABD Manual UAT 2026`, `Test1`) were independently
-- confirmed to have real, non-orphaned rows in every affected table BEFORE
-- this migration ran (their client_id genuinely exists in oc_clients, so the
-- `NOT EXISTS` condition below can never match their data by construction —
-- verified directly, not just reasoned about).
--
-- ON DELETE CASCADE matches the established convention from migration 059
-- and every other client-scoped table this session added (oc_deployments,
-- oc_risks, test_cases, etc.) — deleting a client is a real, deliberate,
-- already-guarded operation; when one genuinely happens, this data should go
-- with it, not silently orphan again the way it has been for years.
--
-- A real bug found and fixed before this migration ever ran cleanly: the
-- first attempt deleted these 39 tables in the same order they were
-- discovered (grep order), which is NOT a valid delete order — several of
-- these 39 tables have their OWN foreign keys to each other (e.g.
-- oc_baselines.metric_id → oc_metric_definitions.id,
-- oc_workflow_executions.event_id → oc_events.id,
-- oc_reconciliation_items.run_id → oc_reconciliation_runs.id, and more),
-- confirmed via a direct `information_schema` query of every real FK
-- touching this table set. Deleting a still-referenced parent row (e.g.
-- oc_metric_definitions) before its child (oc_baselines) fails with a real
-- FK violation — this happened on the first real attempt
-- (`oc_baselines_metric_id_fkey`), was caught immediately (the whole
-- migration rolled back atomically — verified no partial state: no row in
-- `_migrations`, no partial constraint added, orphan counts unchanged), and
-- fixed by re-deriving the delete order topologically (every child deleted
-- strictly before its parent) rather than guessing or force-ordering
-- arbitrarily.

-- A second real bug, same class, found and fixed the same way: after
-- correcting the order above, the second attempt failed too —
-- `oc_engagement_pricing_engagement_id_fkey` — because `oc_engagement_pricing`
-- (a table OUTSIDE this migration's 39, not itself client-scoped) has its own
-- FK to `oc_commercial_engagements`, with NO cascade
-- (`pg_constraint.confdeltype = 'a'`, confirmed by direct query). Deleting an
-- orphaned `oc_commercial_engagements` row while a real `oc_engagement_pricing`
-- row still pointed at it would violate that FK too. A direct query
-- confirmed exactly 3 such rows exist; cleaned first, below, before the
-- orphaned engagements they belong to are deleted. A second direct query
-- (this time deliberately searching for every real FK anywhere in the
-- database that references INTO this 39-table set, not just among the 39
-- themselves) confirmed no other external child table has this issue — the
-- only other one found, `comparison_runs` → `oc_client_database_connections`,
-- can never trigger it: `oc_client_database_connections` has zero orphaned
-- rows (confirmed directly), so no delete against it ever runs.

-- Step 1: delete real orphans, in dependency order (children before
-- parents — see the note above) — safe (see
-- risk_012_platform_fk_integrity_test_1 evidence for the pre-migration
-- orphan count per table and the protected
-- -client verification).
DELETE FROM oc_engagement_pricing p WHERE NOT EXISTS (SELECT 1 FROM oc_commercial_engagements e WHERE e.id = p.engagement_id AND e.client_id IN (SELECT id FROM oc_clients));
DELETE FROM oc_optimization_findings WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_optimization_findings.client_id);
DELETE FROM oc_measurements WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_measurements.client_id);
DELETE FROM oc_baselines WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_baselines.client_id);
DELETE FROM oc_metric_definitions WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_metric_definitions.client_id);
DELETE FROM oc_engagement_services WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_engagement_services.client_id);
DELETE FROM oc_proposals WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_proposals.client_id);
DELETE FROM oc_commercial_engagements WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_commercial_engagements.client_id);
DELETE FROM oc_reconciliation_exceptions WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_reconciliation_exceptions.client_id);
DELETE FROM oc_reconciliation_items WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_reconciliation_items.client_id);
DELETE FROM oc_reconciliation_runs WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_reconciliation_runs.client_id);
DELETE FROM oc_workflow_executions WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_workflow_executions.client_id);
DELETE FROM oc_events WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_events.client_id);
DELETE FROM oc_remediations WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_remediations.client_id);
DELETE FROM oc_notifications WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_notifications.client_id);
DELETE FROM oc_connectors WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_connectors.client_id);
DELETE FROM oc_connection_tests WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_connection_tests.client_id);
DELETE FROM oc_discovery_runs WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_discovery_runs.client_id);
DELETE FROM oc_assessments WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_assessments.client_id);
DELETE FROM oc_client_service_requirements WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_client_service_requirements.client_id);
DELETE FROM oc_client_service_requirement_history WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_client_service_requirement_history.client_id);
DELETE FROM oc_client_service_documents WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_client_service_documents.client_id);
DELETE FROM oc_problems WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_problems.client_id);
DELETE FROM oc_financial_estimates WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_financial_estimates.client_id);
DELETE FROM oc_effort_estimates WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_effort_estimates.client_id);
DELETE FROM oc_notification_preferences WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_notification_preferences.client_id);
DELETE FROM oc_escalations WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_escalations.client_id);
DELETE FROM oc_client_compliance WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_client_compliance.client_id);
DELETE FROM oc_compliance_exceptions WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_compliance_exceptions.client_id);
DELETE FROM oc_client_services WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_client_services.client_id);
DELETE FROM oc_payment_methods WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_payment_methods.client_id);
DELETE FROM oc_financial_transactions WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_financial_transactions.client_id);
DELETE FROM oc_jira_issue_links WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_jira_issue_links.client_id);
DELETE FROM oc_client_health_snapshots WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_client_health_snapshots.client_id);
DELETE FROM oc_operations WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_operations.client_id);
DELETE FROM oc_client_database_connections WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_client_database_connections.client_id);
DELETE FROM oc_business_requirement_history WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_business_requirement_history.client_id);
DELETE FROM discovery_extractions WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = discovery_extractions.client_id);
DELETE FROM oc_gap_evidence WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_gap_evidence.client_id);
DELETE FROM oc_transformation_outcomes WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM oc_clients c WHERE c.id = oc_transformation_outcomes.client_id);

-- Step 2: add the missing foreign keys, now that no existing row would violate them.
ALTER TABLE oc_remediations ADD CONSTRAINT fk_oc_remediations_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_notifications ADD CONSTRAINT fk_oc_notifications_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_connectors ADD CONSTRAINT fk_oc_connectors_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_connection_tests ADD CONSTRAINT fk_oc_connection_tests_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_discovery_runs ADD CONSTRAINT fk_oc_discovery_runs_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_assessments ADD CONSTRAINT fk_oc_assessments_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_client_service_requirements ADD CONSTRAINT fk_oc_client_service_requirements_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_client_service_requirement_history ADD CONSTRAINT fk_oc_client_service_requirement_history_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_client_service_documents ADD CONSTRAINT fk_oc_client_service_documents_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_problems ADD CONSTRAINT fk_oc_problems_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_financial_estimates ADD CONSTRAINT fk_oc_financial_estimates_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_effort_estimates ADD CONSTRAINT fk_oc_effort_estimates_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_metric_definitions ADD CONSTRAINT fk_oc_metric_definitions_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_baselines ADD CONSTRAINT fk_oc_baselines_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_measurements ADD CONSTRAINT fk_oc_measurements_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_optimization_findings ADD CONSTRAINT fk_oc_optimization_findings_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_transformation_outcomes ADD CONSTRAINT fk_oc_transformation_outcomes_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_events ADD CONSTRAINT fk_oc_events_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_workflow_executions ADD CONSTRAINT fk_oc_workflow_executions_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_notification_preferences ADD CONSTRAINT fk_oc_notification_preferences_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_escalations ADD CONSTRAINT fk_oc_escalations_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_client_compliance ADD CONSTRAINT fk_oc_client_compliance_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_compliance_exceptions ADD CONSTRAINT fk_oc_compliance_exceptions_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_client_services ADD CONSTRAINT fk_oc_client_services_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_commercial_engagements ADD CONSTRAINT fk_oc_commercial_engagements_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_engagement_services ADD CONSTRAINT fk_oc_engagement_services_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_proposals ADD CONSTRAINT fk_oc_proposals_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_payment_methods ADD CONSTRAINT fk_oc_payment_methods_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_financial_transactions ADD CONSTRAINT fk_oc_financial_transactions_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_reconciliation_runs ADD CONSTRAINT fk_oc_reconciliation_runs_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_reconciliation_items ADD CONSTRAINT fk_oc_reconciliation_items_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_reconciliation_exceptions ADD CONSTRAINT fk_oc_reconciliation_exceptions_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_jira_issue_links ADD CONSTRAINT fk_oc_jira_issue_links_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_client_health_snapshots ADD CONSTRAINT fk_oc_client_health_snapshots_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_operations ADD CONSTRAINT fk_oc_operations_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_client_database_connections ADD CONSTRAINT fk_oc_client_database_connections_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_business_requirement_history ADD CONSTRAINT fk_oc_business_requirement_history_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE discovery_extractions ADD CONSTRAINT fk_discovery_extractions_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
ALTER TABLE oc_gap_evidence ADD CONSTRAINT fk_oc_gap_evidence_client FOREIGN KEY (client_id) REFERENCES oc_clients(id) ON DELETE CASCADE;
