/**
 * Real, reusable disposable-QA-client cleanup — the exact FK-ordered
 * delete + zero-orphan verification + protected-client check performed
 * manually via ad-hoc scripts throughout this session, now a real,
 * reusable script every *_test_N.mjs run can call identically.
 *
 * Usage: node cleanup-qa-client.mjs <clientId> <exactClientName>
 *
 * Never deletes without first verifying the exact id+name match, and
 * never touches the two permanently-protected real clients.
 */
import pg from 'pg';

const PROTECTED_CLIENT_IDS = new Set([
  'client-9a2a1b23-5872-45d5-8246-2f0ba05bc691', // Test1
  'client-19fa8f94-ea5a-45d6-8c23-490a9e1e758f', // AskABD Manual UAT 2026
]);

const OTHER_TABLES = [
  'client_connection_security', 'client_identity_mapping', 'client_integration_allowlist',
  'discovery_extractions', 'discovery_sources', 'generated_documents', 'oc_assessments', 'oc_baselines',
  'oc_business_requirement_history', 'oc_business_requirements', 'oc_client_compliance',
  'oc_client_database_connections', 'oc_client_health_snapshots', 'oc_client_notes', 'oc_client_requests',
  'oc_client_service_documents', 'oc_client_service_requirement_history', 'oc_client_service_requirements',
  'oc_client_services', 'oc_client_tasks', 'oc_commercial_engagements', 'oc_compliance_exceptions',
  'oc_connection_tests', 'oc_connectors', 'oc_contacts', 'oc_decisions', 'oc_defects', 'oc_discovery_runs',
  'oc_effort_estimates', 'oc_engagement_services', 'oc_escalations',
  'oc_workflow_executions', 'oc_events', // order matters: workflow_executions.event_id -> oc_events(id)
  'oc_financial_estimates',
  'oc_financial_transactions', 'oc_gap_evidence', 'oc_gap_options', 'oc_gaps', 'oc_incidents', 'oc_invitations',
  'oc_jira_issue_links', 'oc_lifecycle', 'oc_measurements', 'oc_metric_definitions', 'oc_migration_runs',
  'oc_notification_preferences', 'oc_notifications', 'oc_operations', 'oc_optimization_findings',
  'oc_optimization_rules', 'oc_payment_methods', 'oc_problems', 'oc_proposals', 'oc_recommendations',
  'oc_reconciliation_exceptions', 'oc_reconciliation_items', 'oc_reconciliation_runs', 'oc_remediations',
  'oc_transformation_outcomes', 'oc_transformations', 'oc_workflow_rules',
  'otp_challenges', 'test_cases', 'test_defects', 'test_executions', 'test_runs', 'test_suites',
];

const ALL_TABLES_FOR_ORPHAN_SWEEP = [
  ...OTHER_TABLES.filter(t => t !== 'oc_workflow_executions' && t !== 'oc_events'),
  'comparison_runs', 'oc_configuration_baselines', 'oc_configuration_exceptions', 'oc_configuration_snapshots',
  'oc_events', 'oc_workflow_executions',
];

// Real gap found live (migration_validation_test_1): these tables are
// generic entity-audit/versioning/workflow tables keyed by
// (entity_type, entity_id) — no client_id column at all, so the
// client_id-keyed sweep above never touches them, even though real
// staff actions (e.g. POST /oc/migration/validate's own
// ocService.createAuditEntry call) genuinely set entity_id = clientId.
// A blanket `entity_id = $1` sweep is correct here since entity_id is
// unenforced/opaque — any row whose entity_id happens to equal this
// client's id is a real orphan once the client itself is gone,
// regardless of which entity_type label was attached to it.
const ENTITY_ID_TABLES = ['oc_audit_log', 'oc_service_actions', 'entity_versions', 'approval_workflows'];

async function main() {
  const [clientId, clientName] = process.argv.slice(2);
  if (!clientId || !clientName) {
    console.error('Usage: node cleanup-qa-client.mjs <clientId> <exactClientName>');
    process.exit(1);
  }
  if (PROTECTED_CLIENT_IDS.has(clientId)) {
    console.error(`REFUSED: ${clientId} is a permanently-protected real client — never deleted by this script.`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://comp_user:comp_local_pass@localhost:5442/comparison' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pre = await client.query('SELECT id, name FROM oc_clients WHERE id = $1', [clientId]);
    if (pre.rows.length !== 1 || pre.rows[0].name !== clientName) {
      throw new Error(`Exact id+name verification failed for ${clientId} / "${clientName}" — aborting, nothing deleted.`);
    }
    console.log('Verified exact match before delete:', JSON.stringify(pre.rows[0]));

    const r1 = await client.query('DELETE FROM oc_configuration_exceptions WHERE client_id = $1', [clientId]);
    const r2 = await client.query('DELETE FROM comparison_runs WHERE client_id = $1', [clientId]);
    const r3 = await client.query('DELETE FROM oc_configuration_snapshots WHERE client_id = $1', [clientId]);
    const r4 = await client.query('DELETE FROM oc_configuration_baselines WHERE client_id = $1', [clientId]);
    console.log(`exceptions:${r1.rowCount} runs:${r2.rowCount} snapshots:${r3.rowCount} baselines:${r4.rowCount}`);

    let total = 0;
    for (const t of OTHER_TABLES) {
      const r = await client.query(`DELETE FROM ${t} WHERE client_id = $1`, [clientId]);
      if (r.rowCount > 0) { console.log(`${t} -> ${r.rowCount}`); total += r.rowCount; }
    }
    for (const t of ENTITY_ID_TABLES) {
      const r = await client.query(`DELETE FROM ${t} WHERE entity_id = $1`, [clientId]);
      if (r.rowCount > 0) { console.log(`${t} (entity_id) -> ${r.rowCount}`); total += r.rowCount; }
    }
    console.log('total other rows deleted:', total);

    const rc = await client.query('DELETE FROM oc_clients WHERE id = $1 RETURNING id', [clientId]);
    console.log('oc_clients deleted:', rc.rowCount);
    await client.query('COMMIT');
    console.log('COMMITTED');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK:', err.message);
    await pool.end();
    process.exit(1);
  } finally {
    client.release();
  }

  // Zero-orphan verification sweep, independent of the transaction above.
  let orphans = 0;
  for (const t of ALL_TABLES_FOR_ORPHAN_SWEEP) {
    const r = await pool.query(`SELECT COUNT(*) FROM ${t} WHERE client_id = $1`, [clientId]);
    const n = parseInt(r.rows[0].count, 10);
    if (n > 0) { console.log('ORPHAN in', t, ':', n); orphans += n; }
  }
  for (const t of ENTITY_ID_TABLES) {
    const r = await pool.query(`SELECT COUNT(*) FROM ${t} WHERE entity_id = $1`, [clientId]);
    const n = parseInt(r.rows[0].count, 10);
    if (n > 0) { console.log('ORPHAN in', t, '(entity_id):', n); orphans += n; }
  }
  console.log('Total orphans found:', orphans);

  const gone = await pool.query('SELECT id FROM oc_clients WHERE id = $1', [clientId]);
  console.log('QA client still present?', gone.rows.length > 0);

  for (const pid of PROTECTED_CLIENT_IDS) {
    const p = await pool.query('SELECT id, name FROM oc_clients WHERE id = $1', [pid]);
    console.log('Protected client check:', JSON.stringify(p.rows));
  }

  await pool.end();
  if (orphans > 0 || gone.rows.length > 0) process.exit(1);
}

main();
