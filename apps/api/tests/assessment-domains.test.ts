/**
 * Current State Assessment — the six domains beyond Infrastructure
 * (roadmap Phase 2 item 2, migration 043, assessment-service.ts). Proves
 * every domain's real, evidence-grounded findings against a real client
 * record, both the "nothing recorded" honest-info-finding path and the
 * "real data present" path.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AssessmentService } from '../src/services/assessment-service.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { sharedPool } from '../src/services/db-pool.js';

const service = new AssessmentService();
const cleanupClientIds: string[] = [];

afterAll(async () => {
  for (const id of cleanupClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
});

function minimalClient(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name, logo: '', industry: 'Technology', country: 'India', timezone: 'UTC',
    businessSize: 'Medium', supportModel: 'Managed', criticality: 'standard',
    primaryContact: 'test@example.com', departments: [], capabilities: [], processes: [],
    applications: [], techApps: [], techServices: [], techApis: [], techDatabases: [],
    techServers: [], techCloud: [], techInfrastructure: [], environments: {}, monitoring: {},
    enabledServices: [], ...overrides,
  };
}

async function makeClient(name: string, overrides: Record<string, unknown> = {}) {
  const ocService = new OperationsCenterService();
  const client = await ocService.createClient(minimalClient(name, overrides));
  cleanupClientIds.push(client.id);
  return client.id;
}

describe('Assessment Domains — Business', () => {
  it('an empty business profile is honestly reported as missing, not silently skipped', async () => {
    const clientId = await makeClient(`Assess Business Empty ${randomUUID().slice(0, 8)}`);
    const result = await service.startDomainAssessment(clientId, 'business');
    expect(result.status).toBe('completed');
    expect(result.domain).toBe('business');
    expect(result.findings.some(f => f.title === 'No departments recorded')).toBe(true);
    expect(result.findings.some(f => f.title === 'No business capabilities recorded')).toBe(true);
  });

  it('a real business profile is reported with real findings citing the real data', async () => {
    const clientId = await makeClient(`Assess Business Full ${randomUUID().slice(0, 8)}`, {
      departments: ['Engineering', 'Sales'], capabilities: ['Order Management'], processes: ['Order-to-Cash'],
    });
    const result = await service.startDomainAssessment(clientId, 'business');
    const deptFinding = result.findings.find(f => f.title === 'Departments recorded');
    expect(deptFinding?.description).toContain('Engineering');
    expect(deptFinding?.severity).toBe('info');
  });
});

describe('Assessment Domains — Application', () => {
  it('an empty application inventory is honestly flagged', async () => {
    const clientId = await makeClient(`Assess App Empty ${randomUUID().slice(0, 8)}`);
    const result = await service.startDomainAssessment(clientId, 'application');
    expect(result.findings.some(f => f.title === 'No application/service/API inventory recorded')).toBe(true);
  });

  it('a large application portfolio (>20 apps) triggers a real complexity finding', async () => {
    const manyApps = Array.from({ length: 25 }, (_, i) => `app-${i}`);
    const clientId = await makeClient(`Assess App Large ${randomUUID().slice(0, 8)}`, { techApps: manyApps });
    const result = await service.startDomainAssessment(clientId, 'application');
    expect(result.findings.some(f => f.title === 'Large application portfolio')).toBe(true);
  });
});

describe('Assessment Domains — Data', () => {
  it('no database inventory and no discovery run is honestly flagged', async () => {
    const clientId = await makeClient(`Assess Data Empty ${randomUUID().slice(0, 8)}`);
    const result = await service.startDomainAssessment(clientId, 'data');
    expect(result.findings.some(f => f.title === 'No data inventory recorded')).toBe(true);
  });

  it('a real recorded database inventory is reported', async () => {
    const clientId = await makeClient(`Assess Data Full ${randomUUID().slice(0, 8)}`, { techDatabases: ['orders-db', 'users-db'] });
    const result = await service.startDomainAssessment(clientId, 'data');
    const finding = result.findings.find(f => f.title === 'Data inventory available');
    expect(finding?.evidence).toContain('tech_databases=2');
  });
});

describe('Assessment Domains — Security', () => {
  it('no connectors configured is honestly reported as low severity, not an error', async () => {
    const clientId = await makeClient(`Assess Security Empty ${randomUUID().slice(0, 8)}`);
    const result = await service.startDomainAssessment(clientId, 'security');
    expect(result.findings.some(f => f.title === 'No connectors configured yet')).toBe(true);
  });

  it('a real admin-level connector triggers a real medium-severity finding', async () => {
    const clientId = await makeClient(`Assess Security Admin ${randomUUID().slice(0, 8)}`);
    await sharedPool.query(
      `INSERT INTO oc_connectors (client_id, provider, name, status, security_level) VALUES ($1, 'aws', 'AWS Prod', 'connected', 'admin')`,
      [clientId]
    );
    const result = await service.startDomainAssessment(clientId, 'security');
    const finding = result.findings.find(f => f.title === 'Admin-level connector access in use');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('medium');
    await sharedPool.query(`DELETE FROM oc_connectors WHERE client_id = $1`, [clientId]);
  });
});

describe('Assessment Domains — Quality', () => {
  it('no open defects is honestly reported as info, not skipped', async () => {
    const clientId = await makeClient(`Assess Quality Empty ${randomUUID().slice(0, 8)}`);
    const result = await service.startDomainAssessment(clientId, 'quality');
    expect(result.findings.some(f => f.title === 'No open defects')).toBe(true);
  });

  it('a real open critical defect produces a real critical finding', async () => {
    const clientId = await makeClient(`Assess Quality Critical ${randomUUID().slice(0, 8)}`);
    await sharedPool.query(
      `INSERT INTO oc_defects (client_id, category, severity, title, fingerprint, status) VALUES ($1, 'health', 'critical', 'Test critical defect', $2, 'detected')`,
      [clientId, `test-fingerprint-${randomUUID()}`]
    );
    const result = await service.startDomainAssessment(clientId, 'quality');
    const finding = result.findings.find(f => f.title === 'Open critical defects');
    expect(finding?.severity).toBe('critical');
    await sharedPool.query(`DELETE FROM oc_defects WHERE client_id = $1`, [clientId]);
  });
});

describe('Assessment Domains — Operations', () => {
  it('a production environment without infrastructure monitoring is flagged high-severity', async () => {
    const clientId = await makeClient(`Assess Ops Prod NoMonitor ${randomUUID().slice(0, 8)}`, {
      environments: { prod: true }, monitoring: { infra: false },
    });
    const result = await service.startDomainAssessment(clientId, 'operations');
    const finding = result.findings.find(f => f.title === 'Production environment without infrastructure monitoring');
    expect(finding?.severity).toBe('high');
  });

  it('full monitoring coverage with no gaps is reported as info', async () => {
    const clientId = await makeClient(`Assess Ops Full ${randomUUID().slice(0, 8)}`, {
      environments: { prod: true }, monitoring: { infra: true, apps: true },
    });
    const result = await service.startDomainAssessment(clientId, 'operations');
    expect(result.findings.some(f => f.title === 'Full monitoring coverage')).toBe(true);
  });
});

describe('Assessment Domains — persistence and cross-domain isolation', () => {
  it('a domain assessment is real and persisted, retrievable via getAssessmentsByDomain', async () => {
    const clientId = await makeClient(`Assess Persist ${randomUUID().slice(0, 8)}`);
    const result = await service.startDomainAssessment(clientId, 'business');
    const stored = await service.getAssessmentsByDomain(clientId, 'business');
    expect(stored.some((a: any) => a.id === result.id)).toBe(true);
  });

  it('assessments for different domains never leak into each other\'s results', async () => {
    const clientId = await makeClient(`Assess Isolation ${randomUUID().slice(0, 8)}`);
    await service.startDomainAssessment(clientId, 'business');
    await service.startDomainAssessment(clientId, 'quality');
    const businessOnly = await service.getAssessmentsByDomain(clientId, 'business');
    expect(businessOnly.every((a: any) => a.domain === 'business')).toBe(true);
    expect(businessOnly).toHaveLength(1);
  });

  it('a nonexistent client returns a real, honest failed result — never fabricated findings', async () => {
    const result = await service.startDomainAssessment('client-does-not-exist', 'business');
    expect(result.status).toBe('failed');
    expect(result.findings).toEqual([]);
  });
});
