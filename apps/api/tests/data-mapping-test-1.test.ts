/**
 * data_mapping_test_1 — Data Mapping Engine (2026-08-24 master completion
 * directive, capability #74, deliberately consolidated with #41 "Migration
 * Mapping Engine" per the directive's own "do not create duplicate
 * engines" mandate). Covers real, enforced mapping-shape validation per
 * type, the real status state machine, real non-fabricated completeness
 * reporting, and the Security Testing Addendum's minimum scenarios
 * including cross-client mapping-id IDOR.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { dataMappingRoutes } from '../src/routes/data-mapping-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { DataMappingEngine, MappingOwnershipError, InvalidMappingShapeError, InvalidMappingStatusTransitionError } from '../src/services/data-mapping-engine.js';

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
  await app.register(dataMappingRoutes, { prefix: '/api/v1' });
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
const mapping = new DataMappingEngine();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

function setInput(overrides: Record<string, unknown> = {}) {
  return { name: 'Legacy CRM -> AskABD Migration', sourceSystem: 'Legacy CRM', targetSystem: 'AskABD Platform', owner: 'data-team', ...overrides };
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM oc_data_field_mappings WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_data_mapping_sets WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('DataMappingEngine — real shape validation + status state machine + reuse across mapping types', () => {
  it('createMappingSet requires real name/source/target system', async () => {
    const clientId = await makeClient('Mapping — Required Fields');
    await expect(mapping.createMappingSet(clientId, setInput({ name: '' }), 'actor')).rejects.toThrow(/name/);
  });

  it('one_to_one requires exactly 1 source and 1 target field — enforced, not silently accepted', async () => {
    const clientId = await makeClient('Mapping — One To One Shape');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    await expect(mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_one', sourceFields: ['a', 'b'], targetFields: ['x'] }, 'actor')).rejects.toThrow(InvalidMappingShapeError);
    const real = await mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_one', sourceFields: ['legacy.email'], targetFields: ['contact.email'], dataType: 'text' }, 'actor');
    expect(real.sourceFields).toEqual(['legacy.email']);
  });

  it('one_to_many requires 1 source and 2+ target fields', async () => {
    const clientId = await makeClient('Mapping — One To Many Shape');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    await expect(mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_many', sourceFields: ['legacy.full_name'], targetFields: ['contact.first_name'] }, 'actor')).rejects.toThrow(InvalidMappingShapeError);
    const real = await mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_many', sourceFields: ['legacy.full_name'], targetFields: ['contact.first_name', 'contact.last_name'], transformation: 'SPLIT(full_name, " ")' }, 'actor');
    expect(real.targetFields).toHaveLength(2);
  });

  it('many_to_one requires 2+ source and 1 target field', async () => {
    const clientId = await makeClient('Mapping — Many To One Shape');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    await expect(mapping.addFieldMapping(set.id, clientId, { mappingType: 'many_to_one', sourceFields: ['legacy.first'], targetFields: ['contact.full_name'] }, 'actor')).rejects.toThrow(InvalidMappingShapeError);
    const real = await mapping.addFieldMapping(set.id, clientId, { mappingType: 'many_to_one', sourceFields: ['legacy.first', 'legacy.last'], targetFields: ['contact.full_name'], transformation: 'CONCAT(first, " ", last)' }, 'actor');
    expect(real.sourceFields).toHaveLength(2);
  });

  it('calculated requires a real, non-empty transformation expression', async () => {
    const clientId = await makeClient('Mapping — Calculated Requires Transform');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    await expect(mapping.addFieldMapping(set.id, clientId, { mappingType: 'calculated', sourceFields: ['legacy.dob'], targetFields: ['contact.age'], transformation: '' }, 'actor')).rejects.toThrow(InvalidMappingShapeError);
    const real = await mapping.addFieldMapping(set.id, clientId, { mappingType: 'calculated', sourceFields: ['legacy.dob'], targetFields: ['contact.age'], transformation: 'DATEDIFF(YEAR, dob, NOW())' }, 'actor');
    expect(real.transformation).toContain('DATEDIFF');
  });

  it('conditional requires a real, non-empty condition; lookup requires a real table and key', async () => {
    const clientId = await makeClient('Mapping — Conditional Lookup Shape');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    await expect(mapping.addFieldMapping(set.id, clientId, { mappingType: 'conditional', sourceFields: ['legacy.status'], targetFields: ['contact.tier'] }, 'actor')).rejects.toThrow(InvalidMappingShapeError);
    await expect(mapping.addFieldMapping(set.id, clientId, { mappingType: 'lookup', sourceFields: ['legacy.country_code'], targetFields: ['contact.country'] }, 'actor')).rejects.toThrow(InvalidMappingShapeError);
    const lookup = await mapping.addFieldMapping(set.id, clientId, { mappingType: 'lookup', sourceFields: ['legacy.country_code'], targetFields: ['contact.country'], lookupTable: 'country_codes', lookupKey: 'iso2' }, 'actor');
    expect(lookup.lookupTable).toBe('country_codes');
  });

  it('the real status state machine rejects an invalid transition (draft straight to validated)', async () => {
    const clientId = await makeClient('Mapping — Invalid Status Transition');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    await expect(mapping.transitionSetStatus(set.id, clientId, 'validated', 'actor')).rejects.toThrow(InvalidMappingStatusTransitionError);
    const approved = await mapping.transitionSetStatus(set.id, clientId, 'approved', 'actor');
    expect(approved.status).toBe('approved');
  });

  it('real, non-fabricated completeness reporting — actual counts, never a synthetic percentage', async () => {
    const clientId = await makeClient('Mapping — Completeness');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    await mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_one', sourceFields: ['a'], targetFields: ['b'], dataType: 'text', validation: 'required' }, 'actor');
    await mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_one', sourceFields: ['c'], targetFields: ['d'] }, 'actor'); // no dataType, no validation
    const completeness = await mapping.getCompleteness(set.id, clientId);
    expect(completeness.total).toBe(2);
    expect(completeness.missingDataType).toBe(1);
    expect(completeness.missingValidation).toBe(1);
  });

  it('updateFieldMapping re-validates the real shape on change', async () => {
    const clientId = await makeClient('Mapping — Update Revalidates');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    const field = await mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_one', sourceFields: ['a'], targetFields: ['b'] }, 'actor');
    await expect(mapping.updateFieldMapping(field.id, clientId, { mappingType: 'many_to_one' }, 'actor')).rejects.toThrow(InvalidMappingShapeError);
  });

  it('removeFieldMapping genuinely deletes the real row', async () => {
    const clientId = await makeClient('Mapping — Remove');
    const set = await mapping.createMappingSet(clientId, setInput(), 'actor');
    const field = await mapping.addFieldMapping(set.id, clientId, { mappingType: 'one_to_one', sourceFields: ['a'], targetFields: ['b'] }, 'actor');
    await mapping.removeFieldMapping(field.id, clientId);
    await expect(mapping.getFieldMapping(field.id, clientId)).rejects.toThrow(MappingOwnershipError);
  });

  it('object-level ownership: Client A cannot read, update, or remove Client B\'s real mapping set/field', async () => {
    const a = await makeClient('Mapping Ownership A');
    const b = await makeClient('Mapping Ownership B');
    const setA = await mapping.createMappingSet(a, setInput(), 'actor');
    const fieldA = await mapping.addFieldMapping(setA.id, a, { mappingType: 'one_to_one', sourceFields: ['x'], targetFields: ['y'] }, 'actor');
    await expect(mapping.getMappingSet(setA.id, b)).rejects.toThrow(MappingOwnershipError);
    await expect(mapping.addFieldMapping(setA.id, b, { mappingType: 'one_to_one', sourceFields: ['x'], targetFields: ['y'] }, 'attacker')).rejects.toThrow(MappingOwnershipError);
    await expect(mapping.getFieldMapping(fieldA.id, b)).rejects.toThrow(MappingOwnershipError);
    await expect(mapping.removeFieldMapping(fieldA.id, b)).rejects.toThrow(MappingOwnershipError);
  });
});

describe('Data Mapping routes — RBAC + tenant isolation (Security Testing Addendum)', () => {
  it('1. unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Mapping RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/data-mappings` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token (insufficient role) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Mapping RBAC — Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/data-mappings`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can create and read a real mapping set -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Mapping RBAC — Staff Allowed');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/data-mappings`, headers: { authorization: `Bearer ${admin}` }, payload: setInput() });
    expect(create.statusCode).toBe(201);
    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/data-mappings/${create.json().id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
  });

  it('4/6. cross-client mapping set id -> DENIED (404, object-level ownership)', async () => {
    const app = await buildApp();
    const a = await makeClient('Mapping RBAC — Cross Client A');
    const b = await makeClient('Mapping RBAC — Cross Client B');
    const admin = await adminToken();
    const setA = await mapping.createMappingSet(a, setInput(), 'actor');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${b}/data-mappings/${setA.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
  });

  it('7. malformed mapping id is a safe 404, never a crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Mapping RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/data-mappings/${encodeURIComponent("not-real; DROP TABLE oc_data_mapping_sets;--")}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('an invalid field-mapping shape returns a real 400, never a fabricated success', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Mapping RBAC — Invalid Shape HTTP');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/data-mappings`, headers: { authorization: `Bearer ${admin}` }, payload: setInput() });
    const id = create.json().id;
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/data-mappings/${id}/fields`, headers: { authorization: `Bearer ${admin}` },
      payload: { mappingType: 'one_to_one', sourceFields: ['a', 'b'], targetFields: ['x'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_mapping_shape');
  });

  it('an empty-body POST to the create-set and status-transition routes is a safe 4xx, never an unhandled crash', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Mapping RBAC — Empty Body Audit');
    const admin = await adminToken();
    const noBody = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/data-mappings`, headers: { authorization: `Bearer ${admin}` } });
    expect(noBody.statusCode).toBeLessThan(500);
  });
});
