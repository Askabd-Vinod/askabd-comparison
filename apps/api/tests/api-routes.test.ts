import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/routes/api-routes.js';

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
  });
});
