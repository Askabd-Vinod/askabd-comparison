import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../db/connection.js';
import { CategoryService, ItemService, ComparisonService } from '../services/index.js';

export async function apiRoutes(server: FastifyInstance): Promise<void> {
  const pool = getPool();
  const catSvc = new CategoryService(pool); const itemSvc = new ItemService(pool); const compSvc = new ComparisonService(pool);

  // Categories
  server.get('/categories', async (req, reply) => { reply.send({ categories: await catSvc.list() }); });
  server.get('/categories/:slug', async (req, reply) => { const c = await catSvc.getBySlug((req.params as any).slug); if (!c) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(c); });
  server.post('/categories', async (req, reply) => { const r = await catSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });

  // Items
  server.get('/items', async (req, reply) => { const q = req.query as any; if (q.search) { reply.send({ items: await itemSvc.search(q.search) }); return; } if (q.categoryId) { reply.send({ items: await itemSvc.listByCategory(q.categoryId, { limit: q.limit ? parseInt(q.limit) : undefined, sort: q.sort }) }); return; } reply.send({ items: [] }); });
  server.get('/items/:slug', async (req, reply) => { const item = await itemSvc.getBySlug((req.params as any).slug); if (!item) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(item); });
  server.post('/items', async (req, reply) => { const r = await itemSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });

  // Compare
  server.post('/compare', async (req, reply) => { const b = req.body as any; const items = await itemSvc.compare(b.itemIds ?? []); reply.send({ items }); });

  // Saved Comparisons
  server.post('/comparisons', async (req, reply) => { const r = await compSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/comparisons', async (req, reply) => { const q = req.query as any; reply.send({ comparisons: await compSvc.listByUser(q.userId) }); });
  server.get('/comparisons/shared/:token', async (req, reply) => { const c = await compSvc.getByShareToken((req.params as any).token); if (!c) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(c); });

  // Search (delegates to Search Platform in production)
  server.get('/search', async (req, reply) => { const q = req.query as any; reply.send({ results: await itemSvc.search(q.q ?? '', q.tenantId) }); });
}
