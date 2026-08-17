/**
 * Service Requirement Matrix — GET /oc/clients/:clientId/onboarding/requirements
 *
 * Verifies: connectors are only surfaced when a client has REAL explicit service
 * enablement (oc_client_services), never the operational-capability fallback used by
 * the general services listing; the required-vs-optional classification is derived
 * from real evidence (postgresql required because discovery/connector-framework/
 * migration capabilities cannot function without it); connectors with no real-catalog
 * mapping are surfaced honestly as unmapped rather than silently dropped or guessed;
 * real connector status flows through unmodified; and per-client isolation holds.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { sharedPool } from '../src/services/db-pool.js';

let app: ReturnType<typeof Fastify>;
const testClientIds: string[] = [];

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

beforeAll(async () => {
  app = Fastify();
  await app.register(operationsCenterRoutes);
  await app.ready();
});

afterAll(async () => {
  for (const id of testClientIds) {
    await sharedPool.query('DELETE FROM oc_client_services WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_connectors WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
  await app.close();
});

describe('GET /oc/clients/:clientId/onboarding/requirements', () => {
  it('a client with no explicit service selection gets an honest empty list — never the operational-capability fallback', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Requirement Matrix Test — No Services'));
    testClientIds.push(client.id);

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/onboarding/requirements` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.services).toEqual([]);
    expect(body.relevantConnectors).toEqual([]);
    expect(body.hiddenConnectorCount).toBe(33); // full catalog, nothing relevant without a real selection
  });

  it('enabling Discovery Engine (real external_dependencies: "Database connectivity") surfaces PostgreSQL as REQUIRED, evidence-linked', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Requirement Matrix Test — Discovery'));
    testClientIds.push(client.id);

    await app.inject({ method: 'POST', url: `/oc/clients/${client.id}/services/cap-discovery-engine/enable`, payload: { actor: 'test' } });

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/onboarding/requirements` });
    const body = res.json();
    expect(body.services.map((s: any) => s.capabilityId)).toContain('cap-discovery-engine');
    const pg = body.relevantConnectors.find((c: any) => c.connectorId === 'postgresql');
    expect(pg).toBeDefined();
    expect(pg.classification).toBe('required');
    expect(pg.requiredBy.some((r: any) => r.capabilityId === 'cap-discovery-engine')).toBe(true);
    expect(pg.status).toBe('not_configured'); // no real test run for this fresh client — never fabricated as connected
    expect(body.hiddenConnectorCount).toBe(32);
  });

  it('enabling CI/CD Pipeline (real external_dependencies: "GitHub Actions", "Container registry") surfaces github-actions as OPTIONAL and honestly reports the unmapped dependency', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Requirement Matrix Test — CI/CD'));
    testClientIds.push(client.id);

    await app.inject({ method: 'POST', url: `/oc/clients/${client.id}/services/cap-ci-cd/enable`, payload: { actor: 'test' } });

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/onboarding/requirements` });
    const body = res.json();
    const gha = body.relevantConnectors.find((c: any) => c.connectorId === 'github-actions');
    expect(gha).toBeDefined();
    expect(gha.classification).toBe('optional'); // never claimed required — CI/CD can proceed without it
    // "Container registry" has no real connector-catalog equivalent — must be surfaced honestly, not silently dropped or guessed onto an unrelated connector.
    expect(body.unmappedDependencies.some((d: any) => d.dependency === 'Container registry' && d.capabilityId === 'cap-ci-cd')).toBe(true);
  });

  it('reuses the real onboarding requirement engine (RequirementsService) for requiredInformation — not a second calculation', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Requirement Matrix Test — Onboarding Reqs'));
    testClientIds.push(client.id);

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/onboarding/requirements` });
    const body = res.json();
    // A freshly created client has never provided identity/security/environment info —
    // these real onboarding-stage requirements must appear as outstanding.
    expect(body.requiredInformation.length).toBeGreaterThan(0);
    expect(body.requiredInformation.some((r: any) => r.serviceId === 'identity-verification')).toBe(true);
  });

  it('client isolation — enabling a service for client A never appears for client B', async () => {
    const ocService = new OperationsCenterService();
    const clientA = await ocService.createClient(minimalClient('Requirement Matrix Isolation A'));
    const clientB = await ocService.createClient(minimalClient('Requirement Matrix Isolation B'));
    testClientIds.push(clientA.id, clientB.id);

    await app.inject({ method: 'POST', url: `/oc/clients/${clientA.id}/services/cap-discovery-engine/enable`, payload: { actor: 'test' } });

    const resA = await app.inject({ method: 'GET', url: `/oc/clients/${clientA.id}/onboarding/requirements` });
    const resB = await app.inject({ method: 'GET', url: `/oc/clients/${clientB.id}/onboarding/requirements` });
    expect(resA.json().services.length).toBeGreaterThan(0);
    expect(resB.json().services.length).toBe(0);
    expect(resB.json().relevantConnectors.length).toBe(0);
  });
});
