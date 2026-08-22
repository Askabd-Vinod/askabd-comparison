/**
 * GET /oc/me/pending-invitations and POST /oc/me/pending-invitations/:id/accept —
 * real HTTP routes through the real middleware stack (auth + RBAC's default
 * 'authenticated' policy, since these are deliberately NOT listed in rules.ts — see
 * platform/rbac/rules.ts's comment above the invitation section).
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { InvitationService } from '../src/services/invitation-service.js';
import { ClientIdentityMappingService } from '../src/services/client-identity-mapping-service.js';

const SECRET = 'test-secret-value-not-a-real-secret';

function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('askabd-identity')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

async function insertClient(name: string): Promise<string> {
  const result = await sharedPool.query<{ id: string }>(
    `INSERT INTO oc_clients (name, logo, industry, country) VALUES ($1, '', 'Technology', 'India') RETURNING id`,
    [name],
  );
  return result.rows[0]!.id;
}

const service = new InvitationService();
const mappingService = new ClientIdentityMappingService();
const createdClientIds: string[] = [];
const createdOrgContexts: string[] = [];

afterAll(async () => {
  for (const org of createdOrgContexts) {
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]).catch(() => {});
  }
  for (const id of createdClientIds) {
    await sharedPool.query('DELETE FROM oc_invitations WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('GET /oc/me/pending-invitations', () => {
  it('rejects an unauthenticated request (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/me/pending-invitations' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns a real pending invitation for the caller\'s own org_context, and none for an unrelated one', async () => {
    const app = await buildApp();
    const clientId = await insertClient('Pending Route Client');
    createdClientIds.push(clientId);
    const org = `pending-route-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const created = await service.createInvitation({ clientId, orgContext: org, email: 'route-pending@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');

    const ownToken = await signToken({ sub: 'identity-1', org, roles: [] });
    const own = await app.inject({ method: 'GET', url: '/api/v1/oc/me/pending-invitations', headers: { authorization: `Bearer ${ownToken}` } });
    expect(own.statusCode).toBe(200);
    const ownBody = JSON.parse(own.body);
    expect(ownBody.invitations.some((i: { id: string }) => i.id === created.value.invitation.id)).toBe(true);
    // Never leaks the token hash or any secret.
    expect(JSON.stringify(ownBody)).not.toMatch(/token_hash|tokenHash/);

    const otherToken = await signToken({ sub: 'identity-2', org: `unrelated-${randomUUID()}`, roles: [] });
    const other = await app.inject({ method: 'GET', url: '/api/v1/oc/me/pending-invitations', headers: { authorization: `Bearer ${otherToken}` } });
    expect(other.statusCode).toBe(200);
    const otherBody = JSON.parse(other.body);
    expect(otherBody.invitations.length).toBe(0);
    await app.close();
  });
});

describe('POST /oc/me/pending-invitations/:id/accept', () => {
  it('rejects an unauthenticated request (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/me/pending-invitations/inv-fake/accept' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a real authenticated identity can explicitly accept its own pending invitation; a different tenant cannot', async () => {
    const app = await buildApp();
    const clientId = await insertClient('Pending Accept Route Client');
    createdClientIds.push(clientId);
    const org = `pending-accept-route-org-${randomUUID()}`;
    const otherOrg = `pending-accept-other-org-${randomUUID()}`;
    createdOrgContexts.push(org, otherOrg);
    const created = await service.createInvitation({ clientId, orgContext: org, email: 'route-accept@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');

    const otherToken = await signToken({ sub: 'identity-other', org: otherOrg, roles: [] });
    const denied = await app.inject({ method: 'POST', url: `/api/v1/oc/me/pending-invitations/${created.value.invitation.id}/accept`, headers: { authorization: `Bearer ${otherToken}` } });
    expect(denied.statusCode).toBe(404); // no enumeration — looks identical to "not found"
    const stillUnauthorized = await mappingService.isAuthorized(otherOrg, clientId);
    expect(stillUnauthorized).toBe(false);

    const ownToken = await signToken({ sub: 'identity-owner', org, roles: [] });
    const accepted = await app.inject({ method: 'POST', url: `/api/v1/oc/me/pending-invitations/${created.value.invitation.id}/accept`, headers: { authorization: `Bearer ${ownToken}` } });
    expect(accepted.statusCode).toBe(200);
    expect(JSON.parse(accepted.body).clientId).toBe(clientId);

    const authorized = await mappingService.isAuthorized(org, clientId);
    expect(authorized).toBe(true);
    await app.close();
  });
});
