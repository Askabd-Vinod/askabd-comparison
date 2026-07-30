import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn(async () => {
  throw new Error('db unavailable');
});

vi.mock('../src/db/connection.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { apiRoutes } from '../src/routes/api-routes.js';

describe('apiRoutes resilience', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockImplementation(async () => {
      throw new Error('db unavailable');
    });
  });

  it('returns safe fallback data for admin template reads when the database is unavailable', async () => {
    const app = Fastify();
    await app.register(apiRoutes);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/templates',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ templates: [] });
  });
});
