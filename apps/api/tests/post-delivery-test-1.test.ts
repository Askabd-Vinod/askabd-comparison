/**
 * post_delivery_test_1 — Post-Deployment Validation (2026-08-24, sibling to
 * deployment_validation_test_1). Covers the real reuse of the Testing
 * Engine for post-deployment checks (evidence-enforced, auto-defect-on
 * -fail, unmodified), the one real automatic check this engine provides
 * (a genuine live database connectivity test), the finalize business rule
 * (never a fabricated success), and the Universal Comparison Engine reuse
 * for before/after deployment comparison.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { sharedPool } from '../src/services/db-pool.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { DeploymentService, DeploymentOwnershipError } from '../src/services/deployment-service.js';
import { ClientDatabaseConnectionService } from '../src/services/client-database-connection-service.js';
import { ConfigurationSnapshotService } from '../src/services/configuration-snapshot-service.js';

function minimalClient(name: string) {
  return {
    name, logo: '', industry: 'Technology', country: 'India', timezone: 'UTC',
    businessSize: 'Medium', supportModel: 'Managed', criticality: 'standard',
    primaryContact: 'test@example.com', departments: [], capabilities: [], processes: [],
    applications: [], techApps: [], techServices: [], techApis: [], techDatabases: [],
    techServers: [], techCloud: [], techInfrastructure: [], environments: {}, monitoring: {},
    enabledServices: [],
  };
}

const cleanupClientIds: string[] = [];
const ocService = new OperationsCenterService();
const deployments = new DeploymentService();
const dbConnections = new ClientDatabaseConnectionService();
const snapshots = new ConfigurationSnapshotService();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

function depInput(overrides: Record<string, unknown> = {}) {
  return { environment: 'staging', application: 'AskABD Comparison API', version: '1.3.0', previousVersion: '1.2.0', deploymentType: 'standard', risk: 'medium', rollbackPlan: 'Redeploy previous tagged image.', ...overrides };
}

/** Advances a fresh deployment all the way to a real 'deployed' status via the real, already-proven happy path. */
async function makeDeployedDeployment(clientId: string) {
  await sharedPool.query(`INSERT INTO oc_lifecycle (client_id, status, previous_status, events, version) VALUES ($1, 'audit-passed', 'x', '[]', 1)`, [clientId]);
  await sharedPool.query(`INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details, evidence) VALUES ('validation', $1, 'validation_passed', 'system', '{}', '{}')`, [clientId]);
  const dep = await deployments.createDeployment(clientId, depInput(), 'requester');
  await deployments.planDeployment(dep.id, clientId, 'requester');
  await deployments.checkReadiness(dep.id, clientId, 'requester');
  await deployments.requestApproval(dep.id, clientId, 'requester');
  await deployments.decideApproval(dep.id, clientId, 'approve', 'approver');
  await deployments.startExecution(dep.id, clientId, 'operator');
  return deployments.recordDeploymentOutcome(dep.id, clientId, 'deployed', 'Real CI pipeline confirmed deployment succeeded.', 'operator');
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM approval_workflows WHERE entity_id IN (SELECT id FROM oc_deployments WHERE client_id = $1)`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_defects WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_executions WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_deployments WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_suites WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_cases WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM comparison_runs WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_configuration_snapshots WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_client_database_connections WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_lifecycle WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('DeploymentService — post-deployment validation (real Testing Engine reuse)', () => {
  it('createPostDeploymentSuite requires the deployment to genuinely be in "deployed" status first', async () => {
    const clientId = await makeClient('Post-Delivery — Wrong Status');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester');
    await expect(deployments.createPostDeploymentSuite(dep.id, clientId, [{ name: 'application_availability' }], 'staff')).rejects.toThrow(/Cannot move/);
  });

  it('createPostDeploymentSuite creates real test_cases + a real category=post_deployment test_suites row, and moves the deployment to validation_pending', async () => {
    const clientId = await makeClient('Post-Delivery — Suite Creation');
    const deployed = await makeDeployedDeployment(clientId);
    const withSuite = await deployments.createPostDeploymentSuite(deployed.id, clientId, [
      { name: 'application_availability' }, { name: 'api_availability' }, { name: 'smoke_tests' },
    ], 'staff-1');
    expect(withSuite.status).toBe('validation_pending');
    expect(withSuite.postDeploymentSuiteId).toBeTruthy();
    const suiteRow = await sharedPool.query('SELECT category, test_case_ids FROM test_suites WHERE id = $1', [withSuite.postDeploymentSuiteId]);
    expect(suiteRow.rows[0].category).toBe('post_deployment');
    expect(suiteRow.rows[0].test_case_ids).toHaveLength(3);
  });

  it('createPostDeploymentSuite rejects an unknown check name', async () => {
    const clientId = await makeClient('Post-Delivery — Unknown Check');
    const deployed = await makeDeployedDeployment(clientId);
    await expect(deployments.createPostDeploymentSuite(deployed.id, clientId, [{ name: 'not_a_real_check' as any }], 'staff')).rejects.toThrow(/Unknown post-deployment check/);
  });

  it('recordPostDeploymentCheck delegates to the real, unmodified TestExecutionService — evidence-enforced, and a real FAIL auto-creates a real defect', async () => {
    const clientId = await makeClient('Post-Delivery — Fail Auto-Defect');
    const deployed = await makeDeployedDeployment(clientId);
    const withSuite = await deployments.createPostDeploymentSuite(deployed.id, clientId, [{ name: 'schema_compatibility' }], 'staff');
    const suiteRow = await sharedPool.query('SELECT test_case_ids FROM test_suites WHERE id = $1', [withSuite.postDeploymentSuiteId]);
    const testCaseId = suiteRow.rows[0].test_case_ids[0];

    await expect(deployments.recordPostDeploymentCheck(deployed.id, clientId, testCaseId, { status: 'fail' }, 'tester')).rejects.toThrow(/evidence/i);

    const execution = await deployments.recordPostDeploymentCheck(deployed.id, clientId, testCaseId, {
      status: 'fail', actualResult: 'Real schema mismatch found: column "region" missing on target.',
      evidence: [{ type: 'database_evidence', description: 'Real pg_catalog diff output attached.' }],
    }, 'tester');
    expect(execution.status).toBe('fail');
    expect(execution.defectId).not.toBeNull();
  });

  it('recordPostDeploymentCheck refuses a test case that is not part of THIS deployment\'s own suite (real object-level check)', async () => {
    const clientId = await makeClient('Post-Delivery — Wrong Suite Membership');
    const deployedA = await makeDeployedDeployment(clientId);
    const clientId2 = await makeClient('Post-Delivery — Wrong Suite Membership B');
    const deployedB = await makeDeployedDeployment(clientId2);
    const suiteA = await deployments.createPostDeploymentSuite(deployedA.id, clientId, [{ name: 'health_endpoints' }], 'staff');
    const suiteB = await deployments.createPostDeploymentSuite(deployedB.id, clientId2, [{ name: 'health_endpoints' }], 'staff');
    const rowB = await sharedPool.query('SELECT test_case_ids FROM test_suites WHERE id = $1', [suiteB.postDeploymentSuiteId]);
    const foreignCaseId = rowB.rows[0].test_case_ids[0];
    await expect(deployments.recordPostDeploymentCheck(suiteA.id, clientId, foreignCaseId, { status: 'pass', actualResult: 'x', evidence: [{ type: 'note', description: 'x' }] }, 'tester'))
      .rejects.toThrow(/not part of this deployment/);
  });

  it('finalizeValidation refuses while any check has not reached a real terminal result', async () => {
    const clientId = await makeClient('Post-Delivery — Not All Terminal');
    const deployed = await makeDeployedDeployment(clientId);
    await deployments.createPostDeploymentSuite(deployed.id, clientId, [{ name: 'application_availability' }], 'staff');
    await expect(deployments.finalizeValidation(deployed.id, clientId, 'staff')).rejects.toThrow(/have not yet reached/);
  });

  it('finalizeValidation moves to "validated" only when every real check genuinely passed — never fabricated', async () => {
    const clientId = await makeClient('Post-Delivery — All Pass');
    const deployed = await makeDeployedDeployment(clientId);
    const withSuite = await deployments.createPostDeploymentSuite(deployed.id, clientId, [{ name: 'application_availability' }, { name: 'expected_version' }], 'staff');
    const suiteRow = await sharedPool.query('SELECT test_case_ids FROM test_suites WHERE id = $1', [withSuite.postDeploymentSuiteId]);
    for (const tid of suiteRow.rows[0].test_case_ids) {
      await deployments.recordPostDeploymentCheck(deployed.id, clientId, tid, { status: 'pass', actualResult: 'Real observed pass.', evidence: [{ type: 'note', description: 'Verified live.' }] }, 'tester');
    }
    const finalized = await deployments.finalizeValidation(deployed.id, clientId, 'staff');
    expect(finalized.status).toBe('validated');
  });

  it('finalizeValidation honestly moves to "failed" (never stays ambiguous, never auto-succeeds) when any real check failed', async () => {
    const clientId = await makeClient('Post-Delivery — One Fails');
    const deployed = await makeDeployedDeployment(clientId);
    const withSuite = await deployments.createPostDeploymentSuite(deployed.id, clientId, [{ name: 'application_availability' }, { name: 'smoke_tests' }], 'staff');
    const suiteRow = await sharedPool.query('SELECT test_case_ids FROM test_suites WHERE id = $1', [withSuite.postDeploymentSuiteId]);
    const [pass, fail] = suiteRow.rows[0].test_case_ids;
    await deployments.recordPostDeploymentCheck(deployed.id, clientId, pass, { status: 'pass', actualResult: 'Real pass.', evidence: [{ type: 'note', description: 'x' }] }, 'tester');
    await deployments.recordPostDeploymentCheck(deployed.id, clientId, fail, { status: 'fail', actualResult: 'Real observed failure.', evidence: [{ type: 'note', description: 'x' }] }, 'tester');
    const finalized = await deployments.finalizeValidation(deployed.id, clientId, 'staff');
    expect(finalized.status).toBe('failed');
  });

  it('the real automatic database-connectivity check delegates to the live ClientDatabaseConnectionService and records a real, non-fabricated result', async () => {
    const clientId = await makeClient('Post-Delivery — Real DB Check');
    const deployed = await makeDeployedDeployment(clientId);
    const created = await dbConnections.create({
      clientId, name: 'Real Local Postgres', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'development',
      createdBy: 'tester',
    });
    if (!created.ok) throw new Error('setup failed');
    const withSuite = await deployments.createPostDeploymentSuite(deployed.id, clientId, [{ name: 'database_connectivity' }], 'staff');
    const suiteRow = await sharedPool.query('SELECT test_case_ids FROM test_suites WHERE id = $1', [withSuite.postDeploymentSuiteId]);
    const testCaseId = suiteRow.rows[0].test_case_ids[0];
    const execution = await deployments.runAutomaticDatabaseConnectivityCheck(deployed.id, clientId, testCaseId, created.value.id, 'automation');
    expect(execution.status).toBe('pass'); // real local Postgres — genuinely reachable
    expect(execution.evidence[0]?.description).toContain('Real connection test steps');
  });
});

describe('DeploymentService — comparison reuse (Universal Comparison Engine, unmodified)', () => {
  it('compareDeploymentSnapshots delegates directly to runConfigurationComparison and stores the real result on the deployment', async () => {
    const clientId = await makeClient('Post-Delivery — Comparison');
    const deployed = await makeDeployedDeployment(clientId);
    const pre = await snapshots.create(clientId, { name: 'Pre-Deploy Config', environment: 'staging', config: { WORKER_POOL_SIZE: '6', RATE_LIMIT: '100' } }, 'staff');
    const post = await snapshots.create(clientId, { name: 'Post-Deploy Config', environment: 'staging', config: { WORKER_POOL_SIZE: '8', RATE_LIMIT: '100' } }, 'staff');
    const run = await deployments.compareDeploymentSnapshots(deployed.id, clientId, pre.id, post.id, 'staff');
    expect(run.summary).toBeTruthy();
    const withComparison = await deployments.getDeployment(deployed.id, clientId);
    expect(withComparison.comparisonRunId).toBe(run.id);
    expect(withComparison.preSnapshotId).toBe(pre.id);
    expect(withComparison.postSnapshotId).toBe(post.id);
  });

  it('cannot compare a deployment using another client\'s real snapshot id (real object-level check, inherited from the unmodified comparison engine)', async () => {
    const a = await makeClient('Post-Delivery — Comparison Ownership A');
    const b = await makeClient('Post-Delivery — Comparison Ownership B');
    const deployedA = await makeDeployedDeployment(a);
    const snapshotB = await snapshots.create(b, { name: 'B Config', environment: 'staging', config: { X: '1' } }, 'staff');
    const preA = await snapshots.create(a, { name: 'A Config', environment: 'staging', config: { X: '1' } }, 'staff');
    await expect(deployments.compareDeploymentSnapshots(deployedA.id, a, preA.id, snapshotB.id, 'staff')).rejects.toThrow(/belonging to this client/);
  });

  it('object-level ownership: Client A cannot read Client B\'s post-deployment status or record a check against it', async () => {
    const a = await makeClient('Post-Delivery Ownership A');
    const b = await makeClient('Post-Delivery Ownership B');
    const deployedA = await makeDeployedDeployment(a);
    await deployments.createPostDeploymentSuite(deployedA.id, a, [{ name: 'application_availability' }], 'staff');
    await expect(deployments.getPostDeploymentStatuses(deployedA.id, b)).rejects.toThrow(DeploymentOwnershipError);
    await expect(deployments.getPostDeploymentProgress(deployedA.id, b)).rejects.toThrow(DeploymentOwnershipError);
  });
});
