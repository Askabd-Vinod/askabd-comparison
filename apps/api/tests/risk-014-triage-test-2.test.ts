/**
 * risk_014_triage_test_2 — a real, more severe finding uncovered while
 * continuing the RISK-014 individual-triage pass into the `/oc/me/*`,
 * OTP, and Jira-webhook group (2026-08-24, continuation of
 * `risk_014_triage_test_1`).
 *
 * `GET /oc/me`, `GET /oc/me/pending-invitations`, and
 * `POST /oc/me/pending-invitations/:id/accept` were read in full and
 * confirmed genuinely safe — each resolves everything from the caller's
 * own verified identity (`auth.tenantId`/`auth.userId`), never from a
 * caller-supplied value. No fix needed; no test added for these (already
 * exercised elsewhere).
 *
 * The 3 OTP routes were a real, more severe finding than a plain RBAC
 * gap: `POST /oc/otp/verify`'s success path WRITES to the target
 * `clientId`'s real `business_owner_email`/`business_owner_name`/
 * `organization_legal_name` requirement fields with NO ownership check.
 * Combined with `POST /oc/otp/send` accepting any `clientId` plus an
 * attacker-controlled recipient `email`, any authenticated identity
 * (including a real customer token) could receive an EXISTING client's
 * real OTP at an address of its own choosing and use it to overwrite
 * that client's identity-verification fields. Confirmed (grep) that
 * only staff `(app)/clients/onboard` and `(app)/verify` pages call these
 * routes — never the customer `(portal)`. Fixed with a real Admin.Access
 * rule on all 3. A second, independent fix in the same pass (HTML
 * -escaping /oc/otp/send's caller-supplied email-template fields) closes
 * a related injection vector for the same route — not re-tested here
 * since it has no RBAC-observable behavior (see
 * docs/security-risk-register.md's RISK-014 update for both).
 */
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';

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
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const OTP_ROUTES = ['/api/v1/oc/otp/send', '/api/v1/oc/otp/verify', '/api/v1/oc/otp/resend'];

describe('RISK-014 triage pass 2 — OTP routes: a real cross-client requirement-overwrite gap, closed', () => {
  it('a real customer token is denied on every OTP route — the actual gap this closes (attacker-chosen clientId + attacker-chosen recipient email)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    for (const url of OTP_ROUTES) {
      const res = await app.inject({
        method: 'POST', url, headers: { authorization: `Bearer ${token}` },
        payload: { clientId: 'some-real-existing-client', email: 'attacker@example.com', otp: '123456' },
      });
      expect(res.statusCode, `${url} should deny a customer token`).toBe(403);
    }
  });

  it('an unauthenticated request is denied on every OTP route', async () => {
    const app = await buildApp();
    for (const url of OTP_ROUTES) {
      const res = await app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode, `${url} should reject unauthenticated`).toBe(401);
    }
  });

  it('a real staff (admin) token is not blocked by the RBAC layer on any OTP route (may still 4xx/5xx on business-rule validation, e.g. real email delivery in a test env — that is a separate concern from authorization)', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    for (const url of OTP_ROUTES) {
      const res = await app.inject({
        method: 'POST', url, headers: { authorization: `Bearer ${admin}` },
        payload: { clientId: 'admin-driven-onboarding', email: 'real-owner@example.com', otp: '123456' },
      });
      expect(res.statusCode, `${url} should not be denied by RBAC for staff`).not.toBe(403);
      expect(res.statusCode, `${url} should not be denied by tenant-access for staff (admin crosses all client boundaries)`).not.toBe(401);
    }
  });
});
