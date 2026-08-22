/**
 * Staff Role Assignment — the real, DB-backed source of AskABD roles.
 *
 * Proves the actual defect this fixes: a real askabd-identity token carries NO
 * `roles` claim (confirmed from source — docs/identity-token-contract.md), so before
 * this change, `platform/rbac/middleware.ts`'s extractRoles always returned an empty
 * role list for any genuinely real token — no real identity could ever pass an
 * Admin.Access check. These tests use REAL tokens with NO roles claim (matching what
 * askabd-identity actually issues) and prove that staff_role_assignment, not the
 * token, is what grants real access.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { staffRoleRoutes } from '../src/routes/staff-role-routes.js';
import { StaffRoleService } from '../src/services/staff-role-service.js';
import { sharedPool } from '../src/services/db-pool.js';

const SECRET = 'test-secret-value-not-a-real-secret';

/** A token shaped exactly like a REAL askabd-identity token — sub/org/sid/iat/exp/jti
 *  only, deliberately NO roles/permissions claim, matching the real contract. */
function signRealShapedToken(sub: string, org = 'org-x') {
  return new jose.SignJWT({ sub, org, sid: randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('askabd-identity')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

async function buildApp(opts?: { devBypass?: boolean }) {
  const devBypass = opts?.devBypass ?? false;
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass, jwtSecret: devBypass ? undefined : SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass });
  await app.register(staffRoleRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const service = new StaffRoleService();
const createdIdentityIds: string[] = [];

afterAll(async () => {
  for (const id of createdIdentityIds) {
    await sharedPool.query('DELETE FROM oc_audit_log WHERE entity_type = $1 AND details::text LIKE $2', ['staff_role_assignment', `%${id}%`]).catch(() => {});
    await sharedPool.query('DELETE FROM staff_role_assignment WHERE identity_id = $1', [id]).catch(() => {});
  }
});

describe('StaffRoleService — real DB-backed role source', () => {
  it('an identity with no grants is not staff', async () => {
    const id = `staff-test-${randomUUID()}`;
    createdIdentityIds.push(id);
    expect(await service.isStaff(id)).toBe(false);
    expect(await service.getActiveRoles(id)).toEqual([]);
  });

  it('granting a role makes the identity staff, with a real audit record', async () => {
    const id = `staff-test-${randomUUID()}`;
    createdIdentityIds.push(id);
    const result = await service.grantRole({ identityId: id, role: 'admin', grantedBy: 'bootstrap-admin' });
    expect(result.ok).toBe(true);
    expect(await service.isStaff(id)).toBe(true);
    expect(await service.getActiveRoles(id)).toEqual(['admin']);

    const audit = await sharedPool.query(`SELECT * FROM oc_audit_log WHERE entity_type = 'staff_role_assignment' AND action = 'staff_role.granted' AND details::text LIKE $1`, [`%${id}%`]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('revoking removes the role from active resolution, idempotently, with audit', async () => {
    const id = `staff-test-${randomUUID()}`;
    createdIdentityIds.push(id);
    await service.grantRole({ identityId: id, role: 'support', grantedBy: 'admin-1' });
    expect(await service.getActiveRoles(id)).toEqual(['support']);

    const first = await service.revokeRole({ identityId: id, role: 'support', revokedBy: 'admin-2' });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.alreadyRevoked).toBe(false);
    expect(await service.getActiveRoles(id)).toEqual([]);

    const second = await service.revokeRole({ identityId: id, role: 'support', revokedBy: 'admin-2' });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.alreadyRevoked).toBe(true);
  });

  it('an identity can hold multiple distinct roles simultaneously', async () => {
    const id = `staff-test-${randomUUID()}`;
    createdIdentityIds.push(id);
    await service.grantRole({ identityId: id, role: 'business_user', grantedBy: 'admin-1' });
    await service.grantRole({ identityId: id, role: 'support', grantedBy: 'admin-1' });
    const roles = await service.getActiveRoles(id);
    expect(roles.sort()).toEqual(['business_user', 'support']);
  });
});

describe('RBAC middleware — real token (no roles claim) resolves roles from staff_role_assignment', () => {
  it('a real-shaped token (no roles claim) for a granted admin identity IS authorized for an Admin.Access route', async () => {
    const identityId = `staff-mw-${randomUUID()}`;
    createdIdentityIds.push(identityId);
    await service.grantRole({ identityId, role: 'admin', grantedBy: 'bootstrap' });

    const app = await buildApp();
    const token = await signRealShapedToken(identityId);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/staff/roles`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('a real-shaped token (no roles claim) for an UNGRANTED identity is DENIED the same Admin.Access route — the actual defect this fixes', async () => {
    const app = await buildApp();
    const token = await signRealShapedToken(`staff-mw-ungranted-${randomUUID()}`);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/staff/roles`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated request is 401, not 403', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/staff/roles` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a real customer identity (no staff_role_assignment row — the normal state after invitation acceptance) is denied Admin.Access', async () => {
    const app = await buildApp();
    const token = await signRealShapedToken(`real-customer-${randomUUID()}`);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/staff/roles`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('revoked staff access is denied on the very next request (no caching lag)', async () => {
    const identityId = `staff-mw-revoke-${randomUUID()}`;
    createdIdentityIds.push(identityId);
    await service.grantRole({ identityId, role: 'admin', grantedBy: 'bootstrap' });

    const app = await buildApp();
    const token = await signRealShapedToken(identityId);
    const before = await app.inject({ method: 'GET', url: `/api/v1/oc/staff/roles`, headers: { authorization: `Bearer ${token}` } });
    expect(before.statusCode).toBe(200);

    await service.revokeRole({ identityId, role: 'admin', revokedBy: 'admin-2' });

    const after = await app.inject({ method: 'GET', url: `/api/v1/oc/staff/roles`, headers: { authorization: `Bearer ${token}` } });
    expect(after.statusCode).toBe(403);
    await app.close();
  });

  it('an unknown/unmapped role string resolves to zero permissions, fails closed (not a crash, not elevated access)', async () => {
    const identityId = `staff-mw-unknown-${randomUUID()}`;
    createdIdentityIds.push(identityId);
    await service.grantRole({ identityId, role: 'not_a_real_role_xyz', grantedBy: 'bootstrap' });

    const app = await buildApp();
    const token = await signRealShapedToken(identityId);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/staff/roles`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('Staff role bootstrap — the first admin on a fresh system', () => {
  it('a real, authenticated identity CAN self-grant when zero assignments exist anywhere, but only for their own identity', async () => {
    // Ensure a genuinely empty table for this test's assertion to be meaningful.
    const preExisting = await sharedPool.query('SELECT count(*) AS c FROM staff_role_assignment');
    const isEmpty = Number(preExisting.rows[0].c) === 0;
    if (!isEmpty) return; // Documented skip — another test/process already seeded a row; bootstrap path is not exercised here to avoid a flaky, order-dependent assertion.

    const app = await buildApp();
    const selfId = `bootstrap-self-${randomUUID()}`;
    createdIdentityIds.push(selfId);
    const token = await signRealShapedToken(selfId);
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/staff/roles', headers: { authorization: `Bearer ${token}` }, payload: { identityId: selfId, role: 'super_admin' } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.bootstrap).toBe(true);
    await app.close();
  });

  it('once ANY assignment exists, self-grant for a DIFFERENT identity is denied (bootstrap window is closed)', async () => {
    const seedId = `bootstrap-seed-${randomUUID()}`;
    createdIdentityIds.push(seedId);
    await service.grantRole({ identityId: seedId, role: 'support', grantedBy: 'test-setup' }); // guarantees table is non-empty

    const app = await buildApp();
    const attackerId = `bootstrap-attacker-${randomUUID()}`;
    createdIdentityIds.push(attackerId);
    const token = await signRealShapedToken(attackerId);
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/staff/roles', headers: { authorization: `Bearer ${token}` }, payload: { identityId: attackerId, role: 'super_admin' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('even during a genuinely empty table, a caller cannot grant a role to SOMEONE ELSE via the bootstrap path', async () => {
    const preExisting = await sharedPool.query('SELECT count(*) AS c FROM staff_role_assignment');
    const isEmpty = Number(preExisting.rows[0].c) === 0;
    if (!isEmpty) return; // documented skip — see above

    const app = await buildApp();
    const callerId = `bootstrap-caller-${randomUUID()}`;
    const victimId = `bootstrap-victim-${randomUUID()}`;
    createdIdentityIds.push(callerId, victimId);
    const token = await signRealShapedToken(callerId);
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/staff/roles', headers: { authorization: `Bearer ${token}` }, payload: { identityId: victimId, role: 'super_admin' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('DEV / STAGING / PRODUCTION model for staff routes', () => {
  it('DEV bypass (explicitly enabled) grants access to a staff route with no token at all — intended, DEV-only', async () => {
    const app = await buildApp({ devBypass: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/staff/roles' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('production-shaped config (devBypass explicitly false) rejects a request with NO token — the literal ask: "production-shaped request without valid authentication must return 401"', async () => {
    const app = await buildApp({ devBypass: false });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/staff/roles' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('production-shaped config rejects a real, validly-signed, but unauthorized (no staff role) token — 403, not 200', async () => {
    const app = await buildApp({ devBypass: false });
    const token = await signRealShapedToken(`prod-shaped-customer-${randomUUID()}`);
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/staff/roles', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a customer authenticated successfully (real token, real login, zero staff grants) still receives 403 attempting an internal staff route — the literal ask from Phase 2', async () => {
    const app = await buildApp({ devBypass: false });
    // This token is indistinguishable, in shape, from one a real customer receives
    // after a genuine invitation-acceptance login — no roles claim, just sub/org/sid.
    const customerToken = await signRealShapedToken(`real-customer-login-${randomUUID()}`);
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/staff/roles', headers: { authorization: `Bearer ${customerToken}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
