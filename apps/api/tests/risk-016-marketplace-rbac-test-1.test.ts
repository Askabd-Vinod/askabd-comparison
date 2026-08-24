/**
 * risk_016_marketplace_rbac_test_1 — a COMPLETE RBAC + tenant-isolation audit
 * of the comparison-marketplace surface (RISK-016, per the "ASKABD ENTERPRISE
 * OPERATIONS — INTEGRATION + COMPLETION PHASE" directive's Phase 1). This
 * surface (`apps/api/src/routes/{api,merchant-brand,price,review}-routes.ts`)
 * predates the Enterprise Operations Centre and has never had a mechanical
 * RBAC audit run against it — confirmed by grep that it has ZERO frontend
 * consumers anywhere in `apps/web` (it is a live, reachable, but wholly
 * unused product surface today; "no UI calls it" is not treated as a reason
 * to leave real vulnerabilities unfixed).
 *
 * Real, confirmed findings this pass, each verified by reading the real
 * handler AND (where relevant) the real service before concluding a gap:
 *
 * 1. `GET /admin/templates/:id/attributes` had no rule (every sibling
 *    `/admin/templates/*` route requires a real Template.* permission).
 * 2. THREE pre-existing `rules.ts` entries (`POST /merchants`,
 *    `PUT /merchants/:id`, `POST /merchants/:id/verify`) matched NO real
 *    registered route at all — dead rules giving a false impression that
 *    merchant approval/verification was protected, while the REAL routes
 *    (`/admin/merchants/:id/approve|suspend|reactivate`,
 *    `/admin/verifications/:id/review`) had zero RBAC coverage. Corrected
 *    to target the real paths with the pre-existing `Merchant.Approve`
 *    permission (already correctly scoped to admin/super_admin in roles.ts).
 * 3. All 4 `/admin/brands*` write routes had no rule at all (the one
 *    brand-related rule, `POST /api/v1/brands`, also targeted a
 *    non-existent path).
 * 4. `GET /admin/reviews/pending` and `POST /admin/reviews/:id/moderate`
 *    had no rule at all — any authenticated identity could read the full
 *    moderation queue or approve/reject any review.
 *
 * A real, deeper architectural gap found and DISCLOSED rather than
 * shallow-patched (see docs/security-risk-register.md RISK-017): `POST
 * /comparisons`, `GET /comparisons`, and `POST /reviews` trust a
 * client-supplied `userId` with no verification against the caller's real
 * identity — a genuine IDOR — but this schema has no `User` model and no
 * identity-mapping bridge between askabd-identity's `auth.userId` (not
 * UUID-shaped, e.g. `'dev-user-000'` in dev) and this marketplace's
 * `user_id` UUID columns, so substituting `auth.userId` directly would
 * itself be a wrong fix, not a real one. This test file proves the RBAC
 * fixes above; it does not (cannot, without that missing bridge) prove
 * away RISK-017's IDOR — that remains open and disclosed.
 */
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { apiRoutes } from '../src/routes/api-routes.js';
import { getPrisma } from '../src/services/prisma-client.js';

// This file's own "staff not blocked" assertions genuinely create real rows
// (POST /admin/brands, POST /merchants/register) — real service calls, not
// mocked. Every one uses this run-scoped slug prefix so cleanup can target
// exactly what this file created, matching this session's zero-orphans
// discipline (never a broad DELETE).
const RUN_TAG = `risk016-${Date.now()}`;

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.brand.deleteMany({ where: { slug: { startsWith: RUN_TAG } } }).catch(() => {});
  await prisma.merchant.deleteMany({ where: { slug: { startsWith: RUN_TAG } } }).catch(() => {});
});

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: 'customer-1', org: 'unrelated-org', roles: ['customer'] });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(apiRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

// Fake ids — RBAC denial happens before the handler ever looks these up, and
// for the "staff not blocked" assertions a real target row is unnecessary:
// a 404 (not found) proves RBAC let the request through just as validly as
// a 200 would, without this file needing to seed real marketplace fixtures.
const FAKE_ID = '00000000-0000-0000-0000-000000000001';

describe('RISK-016 — admin/templates attribute read, previously ungated', () => {
  it('customer denied (403)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/templates/${FAKE_ID}/attributes`, headers: { authorization: `Bearer ${await customerToken()}` } });
    expect(res.statusCode).toBe(403);
  });
  it('unauthenticated denied (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/templates/${FAKE_ID}/attributes` });
    expect(res.statusCode).toBe(401);
  });
  it('staff (admin, Template.Read) not blocked by RBAC', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/templates/${FAKE_ID}/attributes`, headers: { authorization: `Bearer ${await adminToken()}` } });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });
});

describe('RISK-016 — brand admin routes, previously fully ungated', () => {
  const BRAND_ROUTES: Array<[string, string]> = [
    ['POST', '/api/v1/admin/brands'],
    ['PUT', `/api/v1/admin/brands/${FAKE_ID}`],
    ['POST', `/api/v1/admin/brands/${FAKE_ID}/archive`],
    ['POST', `/api/v1/admin/brands/${FAKE_ID}/restore`],
  ];

  it('customer denied (403) on every brand admin route', async () => {
    const app = await buildApp();
    const token = await customerToken();
    for (const [method, url] of BRAND_ROUTES) {
      const res = await app.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}` }, payload: { name: 'x', slug: 'x' } });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('unauthenticated denied (401) on every brand admin route', async () => {
    const app = await buildApp();
    for (const [method, url] of BRAND_ROUTES) {
      const res = await app.inject({ method: method as any, url, payload: { name: 'x', slug: 'x' } });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('staff (admin) not blocked by RBAC on any brand admin route', async () => {
    const app = await buildApp();
    const token = await adminToken();
    let i = 0;
    for (const [method, url] of BRAND_ROUTES) {
      const res = await app.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}` }, payload: { name: 'x', slug: `${RUN_TAG}-${i++}` } });
      expect(res.statusCode, `${method} ${url}`).not.toBe(401);
      expect(res.statusCode, `${method} ${url}`).not.toBe(403);
    }
  });
});

describe('RISK-016 — merchant lifecycle admin actions, previously covered only by dead rules', () => {
  const MERCHANT_ADMIN_ROUTES: Array<[string, string]> = [
    ['POST', `/api/v1/admin/merchants/${FAKE_ID}/approve`],
    ['POST', `/api/v1/admin/merchants/${FAKE_ID}/suspend`],
    ['POST', `/api/v1/admin/merchants/${FAKE_ID}/reactivate`],
    ['POST', `/api/v1/admin/verifications/${FAKE_ID}/review`],
  ];

  it('customer denied (403) on every merchant admin action', async () => {
    const app = await buildApp();
    const token = await customerToken();
    for (const [method, url] of MERCHANT_ADMIN_ROUTES) {
      const res = await app.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}` }, payload: { decision: 'approved', reviewerId: 'attacker-controlled' } });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('unauthenticated denied (401) on every merchant admin action', async () => {
    const app = await buildApp();
    for (const [method, url] of MERCHANT_ADMIN_ROUTES) {
      const res = await app.inject({ method: method as any, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('a real business_user (non-admin, non-super_admin) role is ALSO denied — Merchant.Approve is admin/super_admin only', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'biz-1', org: 'org-x', roles: ['business_user'] });
    const res = await app.inject({ method: 'POST', url: `/api/v1/admin/merchants/${FAKE_ID}/approve`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('staff (admin) not blocked by RBAC on any merchant admin action', async () => {
    const app = await buildApp();
    const token = await adminToken();
    for (const [method, url] of MERCHANT_ADMIN_ROUTES) {
      const res = await app.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}` }, payload: { decision: 'approved', reviewerId: 'admin-1' } });
      expect(res.statusCode, `${method} ${url}`).not.toBe(401);
      expect(res.statusCode, `${method} ${url}`).not.toBe(403);
    }
  });
});

describe('RISK-016 — merchant self-registration stays reachable to any authenticated identity (not a gap — intentional)', () => {
  it('a plain customer (no merchant role) can still call register — self-service, not an admin action', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchants/register', headers: { authorization: `Bearer ${token}` }, payload: { name: RUN_TAG, slug: `${RUN_TAG}-register` } });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });

  it('unauthenticated is still denied — self-service requires SOME real identity', async () => {
    const app = await buildApp();
    // No real row is created here (rejected before any service call) — no
    // slug collision risk with the accepted case above, but namespaced
    // under RUN_TAG anyway for consistency and easy auditing if this ever
    // did succeed unexpectedly.
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchants/register', payload: { name: 'x', slug: `${RUN_TAG}-unauth-attempt` } });
    expect(res.statusCode).toBe(401);
  });
});

describe('RISK-016 — review moderation, previously fully ungated', () => {
  it('customer denied (403) on the moderation queue and moderate action', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/admin/reviews/pending', headers: { authorization: `Bearer ${token}` } });
    expect(r1.statusCode).toBe(403);
    const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/reviews/${FAKE_ID}/moderate`, headers: { authorization: `Bearer ${token}` }, payload: { decision: 'approve' } });
    expect(r2.statusCode).toBe(403);
  });

  it('unauthenticated denied (401)', async () => {
    const app = await buildApp();
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/admin/reviews/pending' });
    expect(r1.statusCode).toBe(401);
    const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/reviews/${FAKE_ID}/moderate`, payload: { decision: 'approve' } });
    expect(r2.statusCode).toBe(401);
  });

  it('staff (admin) not blocked by RBAC', async () => {
    const app = await buildApp();
    const token = await adminToken();
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/admin/reviews/pending', headers: { authorization: `Bearer ${token}` } });
    expect(r1.statusCode).not.toBe(401);
    expect(r1.statusCode).not.toBe(403);
  });
});

describe('RISK-016 — real object-ownership/IDOR sweep (RISK-017 disclosure, not a shallow fix)', () => {
  it('DOCUMENTS the real gap: GET /comparisons?userId=<arbitrary> is reachable by any authenticated identity for ANY userId — proven live, not fixed here (see RISK-017)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/comparisons?userId=${FAKE_ID}`, headers: { authorization: `Bearer ${token}` } });
    // Not a 401/403 — RBAC correctly requires SOME authenticated identity
    // (Comparison.Read, held by every role) but cannot express "and it must
    // be your own userId" without a real identity-mapping bridge that does
    // not exist yet. This is the live proof behind RISK-017's disclosure.
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });
});
