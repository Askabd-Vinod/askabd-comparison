/**
 * Health vs Readiness — DB Semantics
 *
 * Regression coverage for a proven P0 found during live DEV failure testing:
 * /health kept reporting database:"ready" while Postgres was actually stopped,
 * because it read a cached startup flag instead of checking live. /ready was
 * already correct (live check). See server.ts's /health handler for the fix.
 *
 * Contract under test:
 *  - /health.database is a LIVE check — must never say "connected" while the
 *    database is actually unreachable.
 *  - /health.status reflects process liveness and must stay 200/"ok"-ish even
 *    when the database is down (a liveness probe must not fail on a downstream
 *    dependency, or an orchestrator would restart a process that a restart
 *    cannot fix).
 *  - /ready reflects traffic-readiness and must report degraded/disconnected
 *    when the database is down.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { sharedPool } from '../src/services/db-pool.js';
import { getPrisma, disconnectPrisma } from '../src/services/prisma-client.js';
import { FastifyInstance } from 'fastify';

let server: FastifyInstance;

beforeAll(async () => {
  server = await createServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
  await disconnectPrisma();
  await sharedPool.end();
});

describe('Health vs Readiness — database semantics', () => {
  it('DB healthy: /health and /ready both report the database as up', async () => {
    const health = await server.inject({ method: 'GET', url: '/health' });
    const ready = await server.inject({ method: 'GET', url: '/ready' });
    expect(health.statusCode).toBe(200);
    expect(health.json().database).toBe('connected');
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready', database: 'connected' });
  });

  it('DB unavailable: /health never claims the database is connected', async () => {
    const prisma = getPrisma();
    const countSpy = vi.spyOn(prisma.category, 'count').mockRejectedValue(new Error('simulated DB outage'));

    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200); // liveness — process itself is still fine
    expect(health.json().database).toBe('disconnected'); // never "connected" during a real outage

    countSpy.mockRestore();
  });

  it('API stays alive and responsive while the DB is unavailable (liveness must not fail)', async () => {
    const prisma = getPrisma();
    const countSpy = vi.spyOn(prisma.category, 'count').mockRejectedValue(new Error('simulated DB outage'));

    const health = await server.inject({ method: 'GET', url: '/health' });
    // Process liveness is independent of the database — restarting the API would not
    // fix a DB outage, so /health must keep responding 200 rather than failing/hanging.
    expect(health.statusCode).toBe(200);
    expect(health.json().service).toBe('comparison-api');

    countSpy.mockRestore();
  });

  it('DB unavailable: /ready correctly reports degraded/disconnected', async () => {
    const prisma = getPrisma();
    const countSpy = vi.spyOn(prisma.category, 'count').mockRejectedValue(new Error('simulated DB outage'));

    const ready = await server.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'degraded', database: 'disconnected' });

    countSpy.mockRestore();
  });

  it('recovery: after the database becomes reachable again, both endpoints reflect it immediately', async () => {
    const prisma = getPrisma();
    const countSpy = vi.spyOn(prisma.category, 'count').mockRejectedValueOnce(new Error('transient outage'));

    const duringOutage = await server.inject({ method: 'GET', url: '/health' });
    expect(duringOutage.json().database).toBe('disconnected');

    // mockRejectedValueOnce has been consumed — the next call goes through to the real DB
    const afterRecovery = await server.inject({ method: 'GET', url: '/health' });
    expect(afterRecovery.json().database).toBe('connected');

    const readyAfterRecovery = await server.inject({ method: 'GET', url: '/ready' });
    expect(readyAfterRecovery.json()).toEqual({ status: 'ready', database: 'connected' });

    countSpy.mockRestore();
  });
});
