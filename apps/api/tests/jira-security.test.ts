/**
 * Jira token security — verifies what the service actually does, not what it claims.
 *
 * Confirmed by code audit and proven here:
 *  - The token is NEVER returned via the config GET response (masked as '••••••••').
 *  - The token NEVER appears in any log line produced while saving/checking config.
 *  - The token IS currently stored in plaintext at rest — this is documented as a
 *    production security blocker in jira-integration-service.ts, not hidden. This test
 *    intentionally asserts that fact so it fails loudly (forcing this test to be updated)
 *    the day real encryption is implemented — it must not silently keep "passing" against
 *    outdated plaintext-storage behavior once that changes.
 *  - A configured token IS usable for real outbound Jira calls (Basic auth header built
 *    correctly) — verified against a mocked fetch, no live Jira credentials required.
 */
import Fastify from 'fastify';
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { JiraIntegrationService } from '../src/services/jira-integration-service.js';
import { sharedPool } from '../src/services/db-pool.js';

const TEST_ENV = 'test-jira-security';
const REAL_LOOKING_TOKEN = 'ATATT3xFfGF0-not-a-real-token-just-test-fixture-1234567890';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  await app.register(operationsCenterRoutes);
  await app.ready();
});

afterAll(async () => {
  await sharedPool.query('DELETE FROM oc_jira_integrations WHERE environment = $1', [TEST_ENV]);
  await app.close();
});

describe('Jira token security', () => {
  it('never returns the token via the config GET response (route level)', async () => {
    await app.inject({
      method: 'POST', url: '/oc/jira/config',
      payload: { environment: TEST_ENV, baseUrl: 'https://example.atlassian.net', projectKey: 'ABD', authMethod: 'api_token', authEmail: 'test@example.com', authToken: REAL_LOOKING_TOKEN },
    });

    const res = await app.inject({ method: 'GET', url: `/oc/jira/config?environment=${TEST_ENV}` });
    expect(res.statusCode).toBe(200);
    const body = res.body;
    expect(body).not.toContain(REAL_LOOKING_TOKEN);
    expect(res.json().config.authToken).toBe('••••••••');
  });

  it('never logs the token while saving or checking config', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const svc = new JiraIntegrationService();
    await svc.saveConfig({
      environment: TEST_ENV, baseUrl: 'https://example.atlassian.net', projectKey: 'ABD',
      authMethod: 'api_token', authEmail: 'test@example.com', authToken: REAL_LOOKING_TOKEN,
    });
    await svc.getConfig(TEST_ENV);
    await svc.checkHealth(TEST_ENV).catch(() => {}); // will fail to actually reach Jira — that's fine, we're checking logs

    const allLoggedText = [...logSpy.mock.calls, ...errSpy.mock.calls, ...infoSpy.mock.calls]
      .flat().map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join('\n');

    expect(allLoggedText).not.toContain(REAL_LOOKING_TOKEN);

    logSpy.mockRestore();
    errSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('DOCUMENTED, NOT HIDDEN: the token is currently stored in plaintext at rest (production blocker)', async () => {
    // This test exists to make the plaintext-storage fact impossible to silently regress on
    // OR silently "fix" without updating this assertion — see the file-level comment above.
    const raw = await sharedPool.query('SELECT auth_token_encrypted FROM oc_jira_integrations WHERE environment = $1', [TEST_ENV]);
    expect(raw.rows[0].auth_token_encrypted).toBe(REAL_LOOKING_TOKEN);
  });

  it('a configured token IS usable for a real outbound Jira call when Jira is actually reachable', async () => {
    let capturedAuthHeader: string | undefined;
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: any, opts: any) => {
      capturedAuthHeader = opts?.headers?.Authorization;
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const svc = new JiraIntegrationService();
    await svc.checkHealth(TEST_ENV);

    fetchSpy.mockRestore();

    const expected = 'Basic ' + Buffer.from(`test@example.com:${REAL_LOOKING_TOKEN}`).toString('base64');
    expect(capturedAuthHeader).toBe(expected);
  });
});
