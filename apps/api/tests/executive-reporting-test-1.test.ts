/**
 * executive_reporting_test_1 — Executive Reporting Engine (2026-08-24
 * master completion directive, capability #62). Covers real, non
 * -fabricated cross-domain aggregation (never an artificial percentage,
 * "insufficient evidence" for any dimension with zero real data), real
 * rule-based recommendations/critical-decisions derived only from
 * observed real conditions, real Markdown export, and the Security
 * Testing Addendum's minimum scenarios including cross-client
 * report-id IDOR.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { executiveReportingRoutes } from '../src/routes/executive-reporting-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { RiskEngine } from '../src/services/risk-engine.js';
import { ExecutiveReportingEngine, ExecutiveReportOwnershipError } from '../src/services/executive-reporting-engine.js';

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: 'customer-1', org: 'unrelated-org', roles: [] });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(executiveReportingRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

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
const risks = new RiskEngine();
const reporting = new ExecutiveReportingEngine();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM oc_executive_reports WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_risks WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('ExecutiveReportingEngine — real, non-fabricated cross-domain aggregation', () => {
  it('a brand-new client with zero real data in every dimension is honestly insufficient_evidence — never a fabricated healthy status', async () => {
    const clientId = await makeClient('Executive Report — Blank Client');
    const report = await reporting.generateReport(clientId, 'staff-1');
    expect(report.overallHealth).toBe('insufficient_evidence');
    for (const d of report.dimensions) {
      expect(d.status).toBe('insufficient_evidence');
      expect(Object.keys(d.data)).toHaveLength(0); // real, empty — no fabricated numbers
    }
    expect(report.nextActions.length).toBeGreaterThan(0);
  });

  it('real open critical/high risks make the Risks dimension genuinely critical, and surface as a real open issue + critical decision', async () => {
    const clientId = await makeClient('Executive Report — Critical Risk');
    await risks.createRisk(clientId, { title: 'Real critical risk', source: 'security', probability: 'high', impact: 'critical' }, 'staff-1');
    const report = await reporting.generateReport(clientId, 'staff-1');
    const riskDim = report.dimensions.find(d => d.name === 'Risks')!;
    expect(riskDim.status).toBe('critical');
    expect(report.overallHealth).toBe('critical');
    expect(report.openIssues.some(i => i.startsWith('Risks:'))).toBe(true);
    expect(report.criticalDecisions.some(d => d.includes('open risk'))).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('a real accepted/mitigated risk does not count as a real open blocker', async () => {
    const clientId = await makeClient('Executive Report — Mitigated Risk');
    const risk = await risks.createRisk(clientId, { title: 'Real risk to mitigate', source: 'security', probability: 'low', impact: 'low', mitigation: 'Real mitigation plan.' }, 'staff-1');
    await risks.mitigate(risk.id, clientId, 'staff-1', 'low');
    const report = await reporting.generateReport(clientId, 'staff-1');
    const riskDim = report.dimensions.find(d => d.name === 'Risks')!;
    expect(riskDim.status).toBe('healthy'); // zero real OPEN risks
  });

  it('real Markdown export renders the real, persisted report content — never fabricated formatting with invented numbers', async () => {
    const clientId = await makeClient('Executive Report — Markdown Export');
    await risks.createRisk(clientId, { title: 'Real risk for export test', source: 'security', probability: 'medium', impact: 'high' }, 'staff-1');
    const report = await reporting.generateReport(clientId, 'staff-1');
    const markdown = await reporting.exportMarkdown(report.id, clientId);
    expect(markdown).toContain('# Executive Report');
    expect(markdown).toContain(report.overallHealth);
    expect(markdown).toContain('## Open Issues');
  });

  it('object-level ownership: Client A cannot read or export Client B\'s real executive report', async () => {
    const a = await makeClient('Executive Report Ownership A');
    const b = await makeClient('Executive Report Ownership B');
    const report = await reporting.generateReport(a, 'staff-1');
    await expect(reporting.getReport(report.id, b)).rejects.toThrow(ExecutiveReportOwnershipError);
    await expect(reporting.exportMarkdown(report.id, b)).rejects.toThrow(ExecutiveReportOwnershipError);
  });
});

describe('Executive Reporting routes — RBAC + object-level ownership (Security Testing Addendum)', () => {
  it('1. unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Executive RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/executive-reports` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token (insufficient role) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Executive RBAC — Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/executive-reports`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can generate and read a real report -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Executive RBAC — Staff Allowed');
    const admin = await adminToken();
    const generate = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/executive-reports`, headers: { authorization: `Bearer ${admin}` } });
    expect(generate.statusCode).toBe(201);
    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/executive-reports/${generate.json().id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
  });

  it('4/6. cross-client report id -> DENIED (404, object-level ownership)', async () => {
    const app = await buildApp();
    const a = await makeClient('Executive RBAC — Cross Client A');
    const b = await makeClient('Executive RBAC — Cross Client B');
    const admin = await adminToken();
    const report = await reporting.generateReport(a, 'staff-1');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${b}/executive-reports/${report.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
  });

  it('7. malformed report id is a safe 404, never a crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Executive RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/executive-reports/${encodeURIComponent("not-real; DROP TABLE oc_executive_reports;--")}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('real Markdown export is reachable over real HTTP for the owning client', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Executive RBAC — Export HTTP');
    const admin = await adminToken();
    const generate = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/executive-reports`, headers: { authorization: `Bearer ${admin}` } });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/executive-reports/${generate.json().id}/export/markdown`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('# Executive Report');
  });
});
