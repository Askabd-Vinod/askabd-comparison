/**
 * AskABD Full Lifecycle E2E Test
 * Tests: Client creation → Lifecycle → Requirements → Connectors → Discovery → Health → Defects
 * Uses real database operations against DEV environment.
 */
import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://comp_user:comp_local_pass@localhost:5442/comparison' });
const API = 'http://localhost:4200/api/v1';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function apiCall(method: string, path: string, body?: any): Promise<any> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function run() {
  console.log('=== ASKABD FULL LIFECYCLE E2E TEST ===\n');
  const ts = Date.now();
  const clientName = `E2E Lifecycle ${ts}`;

  // ─── 1. CLIENT CREATION ────────────────────────────────────────────────────
  console.log('--- 1. CLIENT CREATION ---');
  const createRes = await apiCall('POST', '/oc/clients', {
    name: clientName, industry: 'Information Technology', country: 'India',
    businessSize: 'Medium', supportModel: 'Managed Services', criticality: 'High',
    primaryContact: 'e2e@askabd.com',
  });
  check('Client created', createRes.status === 201, `ID: ${createRes.data?.client?.id}`);
  const clientId = createRes.data?.client?.id;
  if (!clientId) { console.log('FATAL: Cannot proceed without client ID'); await pool.end(); return; }

  // ─── 2. LIFECYCLE INITIALIZATION ──────────────────────────────────────────
  console.log('\n--- 2. LIFECYCLE ---');
  const initRes = await apiCall('POST', '/oc/lifecycle/init', { clientId, initialStatus: 'organization-created' });
  check('Lifecycle initialized', initRes.status === 201, `Status: ${initRes.data?.status}`);

  // Transition to otp-sent
  const t1 = await apiCall('POST', '/oc/lifecycle/transition', { clientId, event: 'organization_created', actor: 'e2e-test' });
  check('Transition organization_created', t1.data?.success === true, `→ ${t1.data?.lifecycle?.status}`);

  // Verify lifecycle state
  const lcGet = await apiCall('GET', `/oc/lifecycle/${clientId}`, null);
  check('Lifecycle GET returns otp-sent', lcGet.data?.status === 'otp-sent');
  check('Lifecycle version is 2', lcGet.data?.version === 2);

  // ─── 3. OTP ────────────────────────────────────────────────────────────────
  console.log('\n--- 3. OTP VERIFICATION ---');
  // Use demo OTP (DEV environment)
  const otpRes = await apiCall('POST', '/oc/otp/verify', { clientId, otp: '123456' });
  check('Demo OTP accepted (DEV)', otpRes.data?.valid === true);

  // Verify lifecycle advanced to otp-verified via system
  // (OTP verify auto-fills identity requirements but doesn't auto-transition lifecycle)
  const t2 = await apiCall('POST', '/oc/lifecycle/transition', { clientId, event: 'otp_verified', actor: 'e2e-test', actorType: 'system', skipReadiness: true });
  check('Transition otp_verified', t2.data?.success === true, `→ ${t2.data?.lifecycle?.status}`);

  // ─── 4. REQUIREMENTS ───────────────────────────────────────────────────────
  console.log('\n--- 4. REQUIREMENTS ---');
  const reqGet = await apiCall('GET', `/oc/client-services/${clientId}/identity-verification/requirements`, null);
  check('Identity requirements loaded', reqGet.status === 200, `Count: ${reqGet.data?.requirements?.length}`);

  // Save a requirement
  const reqSave = await apiCall('PUT', `/oc/client-services/${clientId}/identity-verification/requirements/business_owner_name`, {
    value: 'E2E Test Owner', actor: 'e2e-test',
  });
  check('Requirement saved', reqSave.status === 200, `Status: ${reqSave.data?.requirement?.status}`);

  // Check readiness
  const readiness = await apiCall('GET', `/oc/client-services/${clientId}/identity-verification/readiness`, null);
  check('Readiness endpoint works', readiness.status === 200, `Status: ${readiness.data?.status}`);

  // ─── 5. ADVANCE TO SECURITY-VALIDATED (skip for E2E) ─────────────────────
  console.log('\n--- 5. LIFECYCLE ADVANCEMENT ---');
  const stages = ['identity_verified', 'security_validated', 'environment_registered', 'connectors_configured'];
  for (const event of stages) {
    const r = await apiCall('POST', '/oc/lifecycle/transition', { clientId, event, actor: 'e2e-test', actorType: 'system', skipReadiness: true });
    check(`Transition ${event}`, r.data?.success === true, r.data?.success ? `→ ${r.data?.lifecycle?.status}` : r.data?.error);
  }

  // ─── 6. CONNECTOR ──────────────────────────────────────────────────────────
  console.log('\n--- 6. CONNECTOR ---');
  const connSave = await apiCall('POST', '/oc/connectors/save', {
    provider: 'postgresql', clientId,
    fields: { host: 'localhost', port: '5442', database: 'comparison', username: 'comp_user', password: 'comp_local_pass' },
    securityLevel: 'read-only',
  });
  check('Connector saved', connSave.status === 200, `Status: ${connSave.data?.status}`);

  const connTest = await apiCall('POST', '/oc/connectors/test', {
    provider: 'postgresql', clientId,
    fields: { host: 'localhost', port: '5442', database: 'comparison', username: 'comp_user', password: 'comp_local_pass' },
  });
  check('Connector test completed', connTest.status === 200, `Result: ${connTest.data?.status}`);
  check('Connector connected', connTest.data?.status === 'connected');

  // ─── 7. DISCOVERY ──────────────────────────────────────────────────────────
  console.log('\n--- 7. DISCOVERY ---');
  const discRes = await apiCall('POST', '/oc/discovery/start', { clientId });
  check('Discovery completed', discRes.data?.status === 'completed', `Resources: ${discRes.data?.resourcesFound}`);
  check('Discovery found resources', (discRes.data?.resourcesFound || 0) > 0);

  // ─── 8. ASSESSMENT ─────────────────────────────────────────────────────────
  console.log('\n--- 8. ASSESSMENT ---');
  const assessRes = await apiCall('POST', '/oc/assessment/start', { clientId, discoveryRunId: discRes.data?.id });
  check('Assessment completed', assessRes.data?.status === 'completed', `Findings: ${assessRes.data?.findings?.length}`);

  // ─── 9. CLIENT HEALTH SCORE ────────────────────────────────────────────────
  console.log('\n--- 9. CLIENT HEALTH ---');
  const healthRes = await apiCall('GET', `/oc/clients/${clientId}/health-score`, null);
  check('Health score computed', healthRes.status === 200, `Overall: ${healthRes.data?.overallScore}`);
  check('Health has dimensions', (healthRes.data?.dimensions?.length || 0) > 0);

  // ─── 10. DEFECT DETECTION ──────────────────────────────────────────────────
  console.log('\n--- 10. AUTOMATED DEFECT DETECTION ---');
  const detectRes = await apiCall('POST', '/oc/defects/detect', {});
  check('Detection sweep completed', detectRes.status === 200, `Scanned: ${detectRes.data?.scanned}`);

  // ─── 11. JIRA CONFIGURATION ────────────────────────────────────────────────
  console.log('\n--- 11. JIRA ---');
  const jiraConfigRes = await apiCall('GET', '/oc/jira/config?environment=development', null);
  check('Jira config endpoint works', jiraConfigRes.status === 200);

  // ─── 12. AUDIT TRAIL ───────────────────────────────────────────────────────
  console.log('\n--- 12. AUDIT ---');
  const auditRes = await apiCall('GET', `/oc/audit?entityId=${clientId}&limit=10`, null);
  check('Audit entries exist', (auditRes.data?.entries?.length || 0) > 0, `Count: ${auditRes.data?.entries?.length}`);

  // ─── 13. CLIENT ISOLATION ──────────────────────────────────────────────────
  console.log('\n--- 13. CLIENT ISOLATION ---');
  const otherClients = await pool.query("SELECT id FROM oc_clients WHERE id != $1 LIMIT 1", [clientId]);
  if (otherClients.rows.length > 0) {
    const otherId = otherClients.rows[0].id;
    const otherDisc = await apiCall('GET', `/oc/discovery/${otherId}`, null);
    const ourDisc = await apiCall('GET', `/oc/discovery/${clientId}`, null);
    check('Our discovery returns our data', (ourDisc.data?.runs?.length || 0) > 0 || ourDisc.data?.clientId === clientId);
    check('Other client discovery isolated', otherDisc.data?.clientId === otherId);
  }

  // ─── SUMMARY ───────────────────────────────────────────────────────────────
  console.log(`\n=== E2E LIFECYCLE RESULT ===`);
  console.log(`Client: ${clientId}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(failed === 0 ? 'ALL LIFECYCLE CHECKS PASSED ✓' : `${failed} CHECK(S) FAILED ✗`);

  await pool.end();
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('E2E FATAL:', e.message); process.exit(1); });
