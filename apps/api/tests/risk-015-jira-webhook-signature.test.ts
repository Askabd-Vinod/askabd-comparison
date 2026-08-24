/**
 * risk_015_jira_webhook_signature_test_1 — the real fix for RISK-015
 * (`docs/security-risk-register.md`): `POST /oc/jira/webhook` previously
 * had no real signature/shared-secret verification at all, despite
 * `docs/production-connection-readiness.md` claiming "Shared secret header
 * validation" as its production auth mechanism. This proves the real,
 * cryptographic HMAC-SHA256 fix — not a configuration field that is never
 * actually checked — against the real route, the real service, and a real
 * Postgres-backed anti-replay table (`oc_jira_webhook_deliveries`).
 *
 * Signing scheme (Stripe/GitHub-style, documented in
 * jira-integration-service.ts): HMAC-SHA256(secret, `${timestamp}.${rawBody}`),
 * sent as `X-AskABD-Webhook-Signature` (hex) + `X-AskABD-Webhook-Timestamp`
 * (Unix seconds). Verified over the EXACT raw request bytes (via
 * `middleware/raw-body.ts`), never a re-serialized JSON object — a real,
 * deliberate correctness requirement proven by the "different key order,
 * same signature" test below.
 */
import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { registerRawBodyCapture } from '../src/middleware/raw-body.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { JiraIntegrationService } from '../src/services/jira-integration-service.js';
import { sharedPool } from '../src/services/db-pool.js';

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: 'customer-1', org: 'unrelated-org', roles: [] });

async function buildApp() {
  const app = Fastify();
  registerRawBodyCapture(app);
  // Mirrors server.ts's real publicRoutes config for this route exactly (RISK-015):
  // a real Jira webhook sender can never present a bearer token, so this route's
  // authorization is the HMAC signature check inside the handler, not the auth layer.
  registerAuthMiddleware(app, { publicRoutes: ['/api/v1/oc/jira/webhook'], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

function sign(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

const ENV = `risk015-test-${Date.now()}`;

afterAll(async () => {
  // Real cleanup bug found and fixed by this session's own zero-orphans discipline:
  // several tests below use a per-scenario sub-environment (`${ENV}-stale`,
  // `${ENV}-replay`, etc.), not the bare `ENV` — an exact-match DELETE left 45
  // `oc_jira_integrations` rows and 3 `oc_jira_webhook_deliveries` rows behind
  // on the very first run. A LIKE prefix match cleans every sub-environment
  // this file ever creates, not just the literal base value.
  await sharedPool.query('DELETE FROM oc_jira_webhook_deliveries WHERE environment LIKE $1', [`${ENV}%`]).catch(() => {});
  await sharedPool.query('DELETE FROM oc_jira_integrations WHERE environment LIKE $1', [`${ENV}%`]).catch(() => {});
});

describe('POST /oc/jira/webhook-secret — real, staff-only secret generation', () => {
  it('a customer token is denied (403)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/webhook-secret', headers: { authorization: `Bearer ${token}` }, payload: { environment: ENV } });
    expect(res.statusCode).toBe(403);
  });

  it('unauthenticated is denied (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/webhook-secret', payload: { environment: ENV } });
    expect(res.statusCode).toBe(401);
  });

  it('a staff (admin) token receives a real, plaintext, random secret — 64 hex chars (256 bits)', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/webhook-secret', headers: { authorization: `Bearer ${admin}` }, payload: { environment: ENV } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.environment).toBe(ENV);
  });
});

describe('POST /oc/jira/webhook — real cryptographic verification', () => {
  it('with no secret ever generated for an environment, every request is rejected (fail CLOSED)', async () => {
    const app = await buildApp();
    const freshEnv = `${ENV}-never-configured`;
    const rawBody = JSON.stringify({ webhookEvent: 'jira:issue_updated', issue: { key: 'ABD-1' } });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${freshEnv}`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign('any-secret-at-all', ts, rawBody), 'x-askabd-webhook-timestamp': String(ts) },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('not_configured');
  });

  it('a correctly-signed, fresh request is accepted', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret } = await svc.generateWebhookSecret(ENV);
    const rawBody = JSON.stringify({ webhookEvent: 'jira:issue_updated', issue: { key: 'ABD-999-nonexistent' } });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(secret, ts, rawBody), 'x-askabd-webhook-timestamp': String(ts) },
      payload: rawBody,
    });
    // A valid signature lets the request through to real payload processing —
    // it correctly reports "not linked to AskABD" for a made-up issue key
    // rather than being rejected for authentication reasons.
    expect(res.statusCode).toBe(200);
    expect(res.json().processed).toBe(false);
  });

  it('missing signature header is rejected (401, missing_signature)', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    await svc.generateWebhookSecret(`${ENV}-missing-sig`);
    const rawBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-missing-sig`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-timestamp': String(ts) },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('missing_signature');
  });

  it('missing timestamp header is rejected (401, missing_timestamp)', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret } = await svc.generateWebhookSecret(`${ENV}-missing-ts`);
    const rawBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-missing-ts`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(secret, ts, rawBody) },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('missing_timestamp');
  });

  it('a malformed (non-numeric) timestamp is rejected (401, malformed_timestamp)', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret } = await svc.generateWebhookSecret(`${ENV}-malformed-ts`);
    const rawBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-malformed-ts`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(secret, 123, rawBody), 'x-askabd-webhook-timestamp': 'not-a-number' },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('malformed_timestamp');
  });

  it('a stale timestamp (outside the 5-minute tolerance) is rejected (401, stale_timestamp) even with a mathematically-correct signature for that timestamp', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret } = await svc.generateWebhookSecret(`${ENV}-stale`);
    const rawBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const staleTs = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-stale`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(secret, staleTs, rawBody), 'x-askabd-webhook-timestamp': String(staleTs) },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('stale_timestamp');
  });

  it('the WRONG secret produces an invalid signature — rejected (401, invalid_signature)', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    await svc.generateWebhookSecret(`${ENV}-wrong-secret`);
    const rawBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-wrong-secret`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign('a-completely-different-secret', ts, rawBody), 'x-askabd-webhook-timestamp': String(ts) },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_signature');
  });

  it('a TAMPERED body (signature computed over different bytes than what is actually sent) is rejected (401, invalid_signature)', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret } = await svc.generateWebhookSecret(`${ENV}-tampered`);
    const originalBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const tamperedBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-999-attacker-swapped-this' } });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-tampered`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(secret, ts, originalBody), 'x-askabd-webhook-timestamp': String(ts) },
      payload: tamperedBody, // signature was computed over originalBody, but this is what's actually sent
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_signature');
  });

  it('a real, exact replay of a previously-accepted request is rejected the second time (401, replayed_request)', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret } = await svc.generateWebhookSecret(`${ENV}-replay`);
    const rawBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const ts = Math.floor(Date.now() / 1000);
    const headers = { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(secret, ts, rawBody), 'x-askabd-webhook-timestamp': String(ts) };

    const first = await app.inject({ method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-replay`, headers, payload: rawBody });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({ method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-replay`, headers, payload: rawBody });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('replayed_request');
  });

  it('rotating the secret invalidates the previous one — a request signed with the OLD secret is rejected after rotation', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret: oldSecret } = await svc.generateWebhookSecret(`${ENV}-rotate`);
    await svc.generateWebhookSecret(`${ENV}-rotate`); // rotate — old secret is now stale
    const rawBody = JSON.stringify({ webhookEvent: 'x', issue: { key: 'ABD-1' } });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-rotate`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(oldSecret, ts, rawBody), 'x-askabd-webhook-timestamp': String(ts) },
      payload: rawBody,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_signature');
  });

  it('verification is computed over the exact raw bytes, not a re-serialized object — two JSON payloads that parse to the same object but differ in raw bytes (key order) produce DIFFERENT valid signatures', async () => {
    const app = await buildApp();
    const svc = new JiraIntegrationService();
    const { secret } = await svc.generateWebhookSecret(`${ENV}-raw-bytes`);
    const orderA = '{"webhookEvent":"x","issue":{"key":"ABD-1"}}';
    const orderB = '{"issue":{"key":"ABD-1"},"webhookEvent":"x"}'; // same semantic content, different byte order
    const ts = Math.floor(Date.now() / 1000);

    // Sign orderA, but send orderB — MUST be rejected, proving the signature is
    // bound to actual bytes and not silently normalized via JSON.stringify(parsed).
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/jira/webhook?environment=${ENV}-raw-bytes`,
      headers: { 'content-type': 'application/json', 'x-askabd-webhook-signature': sign(secret, ts, orderA), 'x-askabd-webhook-timestamp': String(ts) },
      payload: orderB,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_signature');
  });
});
