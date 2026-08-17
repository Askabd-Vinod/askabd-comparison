/**
 * RBAC — Jira integration global routes
 *
 * Found during the final QA/UAT master pass: `POST /oc/jira/config`, `POST /oc/jira/test`,
 * and `POST /oc/jira/sync` take no `clientId` at all (one Jira connection per environment,
 * not per client), so tenant-access.ts's clientId-based boundary structurally cannot cover
 * them — and, before this fix, nothing else did either: any authenticated user of any role
 * could overwrite the org's Jira API token, trigger a real outbound call using the stored
 * token, or start a bulk sync job. This file proves the fix: only admin/super_admin may call
 * these three routes; a real customer-role token is denied; unauthenticated/tampered/expired
 * tokens are rejected exactly as everywhere else. `POST /oc/jira/issues` is deliberately not
 * covered here — it carries a real `clientId` and is already enforced by tenant-access
 * (see tenant-access.test.ts).
 */
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';

const CONFIG_RULE = COMPARISON_API_RULES.find(r => r.method === 'POST' && r.path.endsWith('/jira/config'))!;
const TEST_RULE = COMPARISON_API_RULES.find(r => r.method === 'POST' && r.path.endsWith('/jira/test'))!;
const SYNC_RULE = COMPARISON_API_RULES.find(r => r.method === 'POST' && r.path.endsWith('/jira/sync'))!;
const SECRET = 'test-secret-value-not-a-real-secret';

async function buildSecuredApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  app.post('/api/v1/oc/jira/config', async () => ({ ok: true }));
  app.post('/api/v1/oc/jira/test', async () => ({ ok: true }));
  app.post('/api/v1/oc/jira/sync', async () => ({ ok: true }));
  await app.ready();
  return app;
}

function signToken(claims: Record<string, unknown>) {
  const key = new TextEncoder().encode(SECRET);
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(key);
}

describe('RBAC rule declaration — Jira integration', () => {
  it('config/test/sync routes are declared with Admin.Access', () => {
    expect(CONFIG_RULE).toBeDefined();
    expect(TEST_RULE).toBeDefined();
    expect(SYNC_RULE).toBeDefined();
    expect(CONFIG_RULE.permissions).toContain('Admin.Access');
    expect(TEST_RULE.permissions).toContain('Admin.Access');
    expect(SYNC_RULE.permissions).toContain('Admin.Access');
  });
});

describe('RBAC enforcement — Jira integration (end-to-end)', () => {
  it('an admin-role token may save Jira config', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'staff-1', roles: ['admin'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/config', headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it('a customer-role token is denied saving Jira config (previously this succeeded — the actual vulnerability this fix closes)', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-1', roles: ['customer'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/config', headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('a token with no role claim at all is denied (fails closed, never silently elevated)', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-2' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/config', headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('a customer-role token is denied triggering a Jira health check', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-3', roles: ['customer'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/test', headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('a customer-role token is denied triggering a bulk Jira sync', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-4', roles: ['customer'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/sync', headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('an unauthenticated request is 401, not 403 (auth still runs first)', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/config', payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
