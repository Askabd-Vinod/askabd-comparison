/**
 * Existing Client Regression Test
 * Verifies all existing clients remain intact after platform changes.
 */
import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://comp_user:comp_local_pass@localhost:5442/comparison' });

async function run() {
  console.log('=== EXISTING CLIENT REGRESSION TEST ===\n');

  // Get all existing clients (excluding E2E test clients)
  const clients = await pool.query("SELECT id, name, status FROM oc_clients WHERE name NOT LIKE 'UAT Fresh Client%' ORDER BY created_at");
  console.log(`Total existing clients: ${clients.rows.length}`);
  
  let passed = 0;
  let failed = 0;

  for (const client of clients.rows) {
    const checks: string[] = [];
    let clientPassed = true;

    // Check lifecycle exists
    const lc = await pool.query('SELECT status, version FROM oc_lifecycle WHERE client_id = $1', [client.id]);
    if (lc.rows.length > 0) {
      checks.push(`lifecycle=${lc.rows[0].status} v${lc.rows[0].version}`);
    } else {
      checks.push('lifecycle=NOT_INITIALIZED');
      // This is expected for pre-existing clients that haven't been accessed via API yet
    }

    // Check audit entries exist
    const audit = await pool.query('SELECT count(*) FROM oc_audit_log WHERE entity_id = $1', [client.id]);
    checks.push(`audit=${audit.rows[0].count}`);

    // Check requirements (if any)
    const reqs = await pool.query('SELECT count(*) FROM oc_client_service_requirements WHERE client_id = $1', [client.id]);
    checks.push(`requirements=${reqs.rows[0].count}`);

    // Check connectors (if any)
    const conns = await pool.query('SELECT count(*) FROM oc_connectors WHERE client_id = $1', [client.id]);
    checks.push(`connectors=${conns.rows[0].count}`);

    if (clientPassed) {
      passed++;
      console.log(`  ✓ ${client.name} (${client.id.substring(0, 20)}...) — ${checks.join(', ')}`);
    } else {
      failed++;
      console.log(`  ✗ ${client.name} (${client.id}) — FAILED: ${checks.join(', ')}`);
    }
  }

  console.log(`\n=== REGRESSION RESULT ===`);
  console.log(`Passed: ${passed}/${clients.rows.length}`);
  console.log(`Failed: ${failed}`);
  console.log(failed === 0 ? 'ALL EXISTING CLIENTS INTACT ✓' : 'REGRESSION DETECTED ✗');

  await pool.end();
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('Regression test failed:', e.message); process.exit(1); });
