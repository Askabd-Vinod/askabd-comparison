import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import { apiRoutes } from '../src/routes/api-routes.js';
import { disconnectPrisma } from '../src/services/prisma-client.js';

afterAll(async () => { await disconnectPrisma(); });

describe('apiRoutes resilience', () => {
  it('returns templates array (200) for admin template reads', async () => {
    const app = Fastify();
    await app.register(apiRoutes);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/templates',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('templates');
    expect(Array.isArray(body.templates)).toBe(true);
    await app.close();
  });
});
