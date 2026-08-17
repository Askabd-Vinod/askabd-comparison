/**
 * GET /oc/clients/:clientId/connection-tests — real connection-test history, added this
 * milestone to replace the client "Testing" page's previously fully-fabricated,
 * identical-for-every-client hardcoded test-suite list.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';
import { sharedPool } from '../src/services/db-pool.js';

describe('GET /oc/clients/:clientId/connection-tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
    await app.ready();
  });

  it('returns an empty array (not fabricated placeholder rows) for a client with no test history', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/no-such-client-ever/connection-tests' });
    expect(res.statusCode).toBe(200);
    expect(res.json().tests).toEqual([]);
  });

  it('returns a real, previously-persisted connection test row, matching what testConnection() actually wrote', async () => {
    const clientId = `test-conntest-${Date.now()}`;
    await sharedPool.query(
      `INSERT INTO oc_connection_tests (client_id, provider, status, mode, duration_ms, steps, error_message, correlation_id)
       VALUES ($1, 'postgresql', 'connected', 'real', 120, '[{"step":"TCP Connect","pass":true,"durationMs":10}]', '', 'corr-1')`,
      [clientId],
    );

    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/connection-tests` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tests).toHaveLength(1);
    expect(body.tests[0].provider).toBe('postgresql');
    expect(body.tests[0].status).toBe('connected');
    expect(body.tests[0].mode).toBe('real');

    await sharedPool.query('DELETE FROM oc_connection_tests WHERE client_id = $1', [clientId]);
  });
});
