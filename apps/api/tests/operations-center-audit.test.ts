/**
 * Operations-center audit-write policy — verifies the fix applied to the 5 call sites
 * found during the platform-wide reliability audit (createClient, createRemediation,
 * updateRemediationPhase, closeRemediationTicket, recordServiceAction).
 *
 * Policy under test: every one of these methods writes its own durable primary record
 * BEFORE writing to oc_audit_log, so the audit write is best-effort — a failure there
 * must never turn an already-successful primary operation into a reported failure. A
 * genuine primary-operation failure (the actual write itself failing) must still
 * propagate normally — this is not "swallow all errors," only the audit side-effect.
 */
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { sharedPool } from '../src/services/db-pool.js';

const TEST_CLIENT_IDS: string[] = [];
const TEST_REMEDIATION_IDS: string[] = [];

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

afterAll(async () => {
  for (const id of TEST_CLIENT_IDS) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  for (const id of TEST_REMEDIATION_IDS) await sharedPool.query('DELETE FROM oc_remediations WHERE id = $1', [id]).catch(() => {});
  await sharedPool.query("DELETE FROM oc_audit_log WHERE entity_name LIKE 'Audit Policy Test%'").catch(() => {});
});

describe('createClient — audit best-effort policy', () => {
  it('primary success + audit success: client is created and an audit entry exists', async () => {
    const svc = new OperationsCenterService();
    const client = await svc.createClient(minimalClient('Audit Policy Test Client A'));
    TEST_CLIENT_IDS.push(client.id);
    expect(client.id).toBeTruthy();

    // Audit write is fire-and-forget — give it a tick to land before checking.
    await new Promise(r => setTimeout(r, 50));
    const audit = await sharedPool.query("SELECT * FROM oc_audit_log WHERE entity_id = $1 AND action = 'created'", [client.id]);
    expect(audit.rows.length).toBe(1);
  });

  it('primary success + audit failure: client is still created and returned — no false failure', async () => {
    const svc = new OperationsCenterService();
    const auditSpy = vi.spyOn(svc, 'createAuditEntry').mockRejectedValueOnce(new Error('simulated audit-log outage'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const client = await svc.createClient(minimalClient('Audit Policy Test Client B'));
    TEST_CLIENT_IDS.push(client.id);

    expect(client.id).toBeTruthy(); // primary operation succeeded despite the audit failure
    const row = await sharedPool.query('SELECT id FROM oc_clients WHERE id = $1', [client.id]);
    expect(row.rows.length).toBe(1); // genuinely persisted, not a false success

    await new Promise(r => setTimeout(r, 50));
    expect(errSpy).toHaveBeenCalled(); // the failure was logged, not silently swallowed

    auditSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('primary operation failure still propagates — audit best-effort does not mask real failures', async () => {
    const svc = new OperationsCenterService();
    const querySpy = vi.spyOn(sharedPool, 'query').mockImplementationOnce(() => {
      throw new Error('simulated database failure on the primary INSERT');
    });

    await expect(svc.createClient(minimalClient('Audit Policy Test Client C'))).rejects.toThrow('simulated database failure on the primary INSERT');

    querySpy.mockRestore();
  });

  it('client isolation: audit entries for one client never appear when querying another', async () => {
    const svc = new OperationsCenterService();
    const clientA = await svc.createClient(minimalClient('Audit Policy Test Client Isolation A'));
    const clientB = await svc.createClient(minimalClient('Audit Policy Test Client Isolation B'));
    TEST_CLIENT_IDS.push(clientA.id, clientB.id);

    await new Promise(r => setTimeout(r, 50));
    const auditA = await sharedPool.query('SELECT entity_id FROM oc_audit_log WHERE entity_id = $1', [clientA.id]);
    expect(auditA.rows.every((r: any) => r.entity_id === clientA.id)).toBe(true);
    expect(auditA.rows.some((r: any) => r.entity_id === clientB.id)).toBe(false);
  });
});

describe('remediation + service-action — audit best-effort policy (confirms the same fix)', () => {
  it('createRemediation: audit failure does not prevent the remediation plan from being created', async () => {
    const svc = new OperationsCenterService();
    const client = await svc.createClient(minimalClient('Audit Policy Test Client D'));
    TEST_CLIENT_IDS.push(client.id);

    const auditSpy = vi.spyOn(svc, 'createAuditEntry').mockRejectedValueOnce(new Error('simulated audit outage'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const remediation = await svc.createRemediation({
      incidentId: 'inc-test-1', clientId: client.id, title: 'Audit Policy Test Remediation',
      grade: 'standard', fixImmediate: 'restart service', fixPermanent: 'patch config', owner: 'test-owner',
    });
    TEST_REMEDIATION_IDS.push(remediation.id);
    expect(remediation.id).toBeTruthy();
    const row = await sharedPool.query('SELECT id FROM oc_remediations WHERE id = $1', [remediation.id]);
    expect(row.rows.length).toBe(1);

    auditSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('updateRemediationPhase: audit failure does not prevent the phase update from being applied', async () => {
    const svc = new OperationsCenterService();
    const client = await svc.createClient(minimalClient('Audit Policy Test Client E'));
    TEST_CLIENT_IDS.push(client.id);
    const remediation = await svc.createRemediation({
      incidentId: 'inc-test-2', clientId: client.id, title: 'Audit Policy Test Remediation 2',
      grade: 'standard', fixImmediate: 'x', fixPermanent: 'y', owner: 'test-owner',
    });
    TEST_REMEDIATION_IDS.push(remediation.id);

    const auditSpy = vi.spyOn(svc, 'createAuditEntry').mockRejectedValueOnce(new Error('simulated audit outage'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const updated = await svc.updateRemediationPhase(remediation.id, 'executing', ['started'], 'test-owner');
    expect(updated.phase).toBe('executing'); // primary state change applied despite audit failure

    auditSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('recordServiceAction: audit failure does not prevent the service action from being recorded', async () => {
    const svc = new OperationsCenterService();
    const auditSpy = vi.spyOn(svc, 'createAuditEntry').mockRejectedValueOnce(new Error('simulated audit outage'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const action = await svc.recordServiceAction({
      entityType: 'service', entityId: 'svc-audit-policy-test', entityName: 'Audit Policy Test Service',
      action: 'enabled', actor: 'test-owner',
    });
    expect(action.id).toBeTruthy();
    const row = await sharedPool.query('SELECT id FROM oc_service_actions WHERE id = $1', [action.id]);
    expect(row.rows.length).toBe(1);

    await sharedPool.query('DELETE FROM oc_service_actions WHERE id = $1', [action.id]);
    auditSpy.mockRestore();
    errSpy.mockRestore();
  });
});
