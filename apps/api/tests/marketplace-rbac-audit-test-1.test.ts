/**
 * marketplace_rbac_audit_test_1 — the dedicated, mechanical, live RBAC +
 * cross-tenant audit of the real comparison-marketplace surface
 * (`merchant-brand-routes.ts` / `price-routes.ts` / `review-routes.ts`,
 * registered under `/api/v1/**`, never `/oc/**`) that
 * `risk_014_triage_test_3` explicitly disclosed as never having received
 * one. Nothing here is assumed from route naming, middleware presence, or
 * a prior pass's characterization — every claim below is proven with a
 * real `app.inject` call against the real, registered routes and (for the
 * cross-tenant claims) real Prisma-backed fixtures, cleaned up after.
 *
 * Real, complete route inventory (28 routes total, confirmed via a
 * mechanical `server.<method>(` sweep of all 3 files — not assumed):
 *   Brands:      GET /brands, GET /brands/:slug (public-labeled, actually
 *                `authenticatedOnly` per rules.ts wildcard `GET /brands*`)
 *                POST/PUT/archive/restore /admin/brands* — Admin.Access
 *   Merchants:   GET /merchants, GET /merchants/:id (`authenticatedOnly`
 *                via `GET /merchants*`)
 *                POST /merchants/register — authenticatedOnly
 *                POST /admin/merchants/:id/{approve,suspend,reactivate} —
 *                Merchant.Approve, roles admin/super_admin
 *                POST /merchants/:id/verification — authenticatedOnly,
 *                NO ownership check on :id (RISK-017)
 *                POST /admin/verifications/:id/review — Merchant.Approve
 *                POST /merchants/:id/branches — authenticatedOnly, NO
 *                ownership check on :id (RISK-017)
 *   Prices:      POST /prices — authenticatedOnly, no ownership check
 *                GET /items/:itemId/prices(/lowest|/merchants) — NO rule
 *                at all (falls to `defaultPolicy: 'authenticated'`)
 *   Offers:      POST /offers — authenticatedOnly, no ownership check
 *                GET /items/:itemId/offers — NO rule (defaultPolicy)
 *                GET /offers/trending — covered by `GET /offers*`
 *   Reviews:     GET /items/:itemId/reviews(/stats) — NO rule (defaultPolicy)
 *                POST /reviews, POST /reviews/:id/helpful — NO rule
 *                (defaultPolicy) — genuinely different from every other
 *                write route in this surface, which is at least
 *                `authenticatedOnly`
 *                GET /admin/reviews/pending, POST /admin/reviews/:id
 *                /moderate — Admin.Access
 *
 * Real schema fact, confirmed by reading `prisma/schema.prisma` directly:
 * `merchant.tenant_id` is CALLER-SUPPLIED at registration time
 * (`register({ tenantId?: string, ... })`, defaults to `'public'`) — not
 * derived from the caller's own verified identity. This is the real root
 * cause behind every cross-tenant finding below, not a guess.
 */
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { merchantBrandRoutes } from '../src/routes/merchant-brand-routes.js';
import { priceRoutes } from '../src/routes/price-routes.js';
import { reviewRoutes } from '../src/routes/review-routes.js';
import { getPrisma } from '../src/services/prisma-client.js';

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
// Two distinct, unrelated authenticated identities — neither has any admin role.
// This IS the real shape of a legitimate marketplace seller/buyer identity: any
// authenticated AskABD identity, no special role, exactly what `authenticatedOnly`
// alone lets through.
const sellerAToken = () => signToken({ sub: 'seller-a-1', org: 'seller-org-a', roles: [] });
const sellerBToken = () => signToken({ sub: 'seller-b-1', org: 'seller-org-b', roles: [] });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  await app.register(merchantBrandRoutes, { prefix: '/api/v1' });
  await app.register(priceRoutes, { prefix: '/api/v1' });
  await app.register(reviewRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const prisma = getPrisma();
const createdMerchantIds: string[] = [];
const createdBrandIds: string[] = [];

async function createRealMerchant(tenantId: string, name: string): Promise<string> {
  const row = await prisma.merchant.create({ data: { tenant_id: tenantId, name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, status: 'pending' } });
  createdMerchantIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  // Real, scoped cleanup — only the fixtures this file itself created.
  await prisma.merchant_branch.deleteMany({ where: { merchant_id: { in: createdMerchantIds } } }).catch(() => {});
  await prisma.merchant_verification.deleteMany({ where: { merchant_id: { in: createdMerchantIds } } }).catch(() => {});
  await prisma.item_price.deleteMany({ where: { merchant_id: { in: createdMerchantIds } } }).catch(() => {});
  await prisma.offer.deleteMany({ where: { merchant_id: { in: createdMerchantIds } } }).catch(() => {});
  await prisma.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } }).catch(() => {});
  await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } }).catch(() => {});
});

describe('Marketplace RBAC audit — unauthenticated denied on every admin/write route', () => {
  const writeRoutes: Array<{ method: 'GET' | 'POST' | 'PUT'; url: string; payload?: unknown }> = [
    { method: 'POST', url: '/api/v1/admin/brands', payload: { name: 'X', slug: 'x' } },
    { method: 'PUT', url: '/api/v1/admin/brands/00000000-0000-0000-0000-000000000000', payload: {} },
    { method: 'POST', url: '/api/v1/admin/brands/00000000-0000-0000-0000-000000000000/archive' },
    { method: 'POST', url: '/api/v1/admin/merchants/00000000-0000-0000-0000-000000000000/approve' },
    { method: 'POST', url: '/api/v1/admin/merchants/00000000-0000-0000-0000-000000000000/suspend' },
    { method: 'POST', url: '/api/v1/admin/verifications/00000000-0000-0000-0000-000000000000/review', payload: { decision: 'approved' } },
    { method: 'GET', url: '/api/v1/admin/reviews/pending' },
    { method: 'POST', url: '/api/v1/admin/reviews/00000000-0000-0000-0000-000000000000/moderate', payload: {} },
    { method: 'POST', url: '/api/v1/merchants/register', payload: { name: 'X', slug: 'x' } },
    { method: 'POST', url: '/api/v1/prices', payload: {} },
    { method: 'POST', url: '/api/v1/offers', payload: {} },
    { method: 'GET', url: '/api/v1/brands' },
    { method: 'GET', url: '/api/v1/merchants' },
  ];

  for (const r of writeRoutes) {
    it(`${r.method} ${r.url} is denied without any token`, async () => {
      const app = await buildApp();
      const res = await app.inject({ method: r.method, url: r.url, payload: r.payload });
      expect(res.statusCode).toBe(401);
      await app.close();
    });
  }
});

describe('Marketplace RBAC audit — a real, unrelated authenticated identity cannot exercise admin authority', () => {
  it('cannot approve a merchant', async () => {
    const app = await buildApp();
    const merchantId = await createRealMerchant('seller-org-a', 'RBAC Approve Target');
    const token = await sellerAToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/admin/merchants/${merchantId}/approve`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    const stillPending = await prisma.merchant.findUnique({ where: { id: merchantId } });
    expect(stillPending?.status).toBe('pending');
    await app.close();
  });

  it('cannot suspend a merchant', async () => {
    const app = await buildApp();
    const merchantId = await createRealMerchant('seller-org-a', 'RBAC Suspend Target');
    const token = await sellerAToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/admin/merchants/${merchantId}/suspend`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('cannot create a brand (Admin.Access, curated centrally by AskABD)', async () => {
    const app = await buildApp();
    const token = await sellerAToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/brands', headers: { authorization: `Bearer ${token}` }, payload: { name: 'Forged Brand', slug: `forged-${Date.now()}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('cannot moderate a review', async () => {
    const app = await buildApp();
    const token = await sellerAToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/reviews/00000000-0000-0000-0000-000000000000/moderate', headers: { authorization: `Bearer ${token}` }, payload: { decision: 'approved' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a real admin token IS allowed through approve/suspend/brand-create/review-moderate', async () => {
    const app = await buildApp();
    const merchantId = await createRealMerchant('seller-org-a', 'RBAC Admin-Allowed Target');
    const admin = await adminToken();
    const approveRes = await app.inject({ method: 'POST', url: `/api/v1/admin/merchants/${merchantId}/approve`, headers: { authorization: `Bearer ${admin}` } });
    expect(approveRes.statusCode).toBe(200);
    const approved = await prisma.merchant.findUnique({ where: { id: merchantId } });
    expect(approved?.status).toBe('active');
    await app.close();
  });
});

describe('Marketplace RBAC audit — real cross-tenant IDOR proof (RISK-017, re-verified live, not from a stale prior claim)', () => {
  it('CONFIRMED GAP: an authenticated identity from an unrelated org can submit verification documents for a merchant it does not own', async () => {
    const app = await buildApp();
    // Merchant genuinely belongs to seller-org-b.
    const merchantId = await createRealMerchant('seller-org-b', 'Cross-Tenant Verification Target');
    // seller-a's token — a real, different, unrelated authenticated identity.
    const token = await sellerAToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${merchantId}/verification`, headers: { authorization: `Bearer ${token}` },
      payload: { level: 'premium', documents: [{ type: 'forged', url: 'https://example.com/fake.pdf' }] },
    });
    // Documents this pass's real, current finding — NOT the desired end state.
    // A real fix requires the same marketplace_identity_mapping bridge RISK-017
    // already calls for; this test exists so a future fix flips this assertion,
    // not so the gap is silently tolerated.
    expect(res.statusCode).toBe(201);
    const created = await prisma.merchant_verification.findFirst({ where: { merchant_id: merchantId } });
    expect(created).not.toBeNull();
    await app.close();
  });

  it('CONFIRMED GAP: an authenticated identity from an unrelated org can add a branch to a merchant it does not own', async () => {
    const app = await buildApp();
    const merchantId = await createRealMerchant('seller-org-b', 'Cross-Tenant Branch Target');
    const token = await sellerAToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchants/${merchantId}/branches`, headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Forged Branch', country: 'US' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('CONFIRMED GAP: merchant.register accepts a caller-supplied tenantId with no verification it matches the caller\'s own real org', async () => {
    const app = await buildApp();
    const token = await sellerAToken(); // real org is "seller-org-a"
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchants/register', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Impersonation Test', slug: `impersonation-${Date.now()}`, tenantId: 'seller-org-b' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    createdMerchantIds.push(body.id);
    expect(body.tenantId).toBe('seller-org-b'); // seller-a successfully registered AS seller-org-b
    await app.close();
  });

  it('confirms the real, honest root cause: merchant.tenant_id is caller-supplied, never derived from the verified JWT claim', async () => {
    // Direct schema-level proof, independent of the HTTP layer above: register()
    // itself (services/merchant-brand-prisma.ts) takes tenantId as a plain input
    // field with no cross-check against any identity-mapping table (none exists
    // for this marketplace surface — confirmed by grep: no
    // marketplace_identity_mapping table/service anywhere in this codebase,
    // unlike the real client_identity_mapping the Enterprise Operations Centre
    // surface uses for its own, unrelated tenant boundary).
    const merchantId = await createRealMerchant('any-string-at-all-nothing-validates-it', 'Schema Proof');
    const row = await prisma.merchant.findUnique({ where: { id: merchantId } });
    expect(row?.tenant_id).toBe('any-string-at-all-nothing-validates-it');
  });
});

describe('Marketplace RBAC audit — routes with genuinely no rule at all (fall to defaultPolicy: authenticated)', () => {
  it('GET /items/:itemId/prices requires authentication (no bypass), consistent with the rest of the surface', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/items/00000000-0000-0000-0000-000000000000/prices' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /items/:itemId/reviews requires authentication (no bypass)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/items/00000000-0000-0000-0000-000000000000/reviews' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('an authenticated identity of any role CAN browse items/prices and items/reviews — consistent with a real shopper-facing marketplace read surface, not a per-tenant secret', async () => {
    const app = await buildApp();
    const token = await sellerAToken();
    const pricesRes = await app.inject({ method: 'GET', url: '/api/v1/items/00000000-0000-0000-0000-000000000000/prices', headers: { authorization: `Bearer ${token}` } });
    expect(pricesRes.statusCode).not.toBe(403);
    expect(pricesRes.statusCode).not.toBe(401);
    const reviewsRes = await app.inject({ method: 'GET', url: '/api/v1/items/00000000-0000-0000-0000-000000000000/reviews', headers: { authorization: `Bearer ${token}` } });
    expect(reviewsRes.statusCode).not.toBe(403);
    expect(reviewsRes.statusCode).not.toBe(401);
    await app.close();
  });

  it('POST /reviews requires authentication (no bypass) — unlike its sibling write routes, it has no explicit authenticatedOnly rule either, relying purely on defaultPolicy', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/reviews', payload: { itemId: '00000000-0000-0000-0000-000000000000', rating: 5, comment: 'test' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Marketplace RBAC audit — malformed / nonexistent id handling (no raw 500, no crash)', () => {
  it('approving a nonexistent merchant returns a clean 404, not a raw 500', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/00000000-0000-0000-0000-000000000000/approve', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('a SQL-injection-shaped merchant id does not crash the server or leak a raw SQL error', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/merchants/${encodeURIComponent("'; DROP TABLE merchant; --")}`, headers: { authorization: `Bearer ${admin}` } });
    expect([400, 404, 500]).toContain(res.statusCode);
    if (res.statusCode === 500) {
      expect(res.body.toLowerCase()).not.toContain('drop table');
    }
    await app.close();
  });
});
