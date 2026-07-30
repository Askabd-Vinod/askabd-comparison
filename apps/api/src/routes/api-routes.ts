import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../db/connection.js';
import { CategoryService, ItemService, ComparisonService } from '../services/comparison-engine.js';
import { TemplateService } from '../services/template-service.js';
import { SearchService } from '../services/search-service.js';
import { merchantBrandRoutes } from './merchant-brand-routes.js';

async function safeRead<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch {
    return fallback;
  }
}

export async function apiRoutes(server: FastifyInstance): Promise<void> {
  const pool = getPool();
  const catSvc = new CategoryService(pool); const itemSvc = new ItemService(pool);
  const compSvc = new ComparisonService(pool); const tmplSvc = new TemplateService(pool); const searchSvc = new SearchService(pool);

  // Categories
  server.get('/categories', async () => ({ categories: await safeRead(() => catSvc.list(), []) }));
  server.get('/categories/:slug', async (req, reply) => { const c = await safeRead(() => catSvc.getBySlug((req.params as any).slug), null); if (!c) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(c); });
  server.post('/categories', async (req, reply) => { const r = await catSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/categories/:slug/template', async (req, reply) => { const cat = await safeRead(() => catSvc.getBySlug((req.params as any).slug), null); if (!cat) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send({ template: await safeRead(() => tmplSvc.getTemplateByCategory(cat.id), null) }); });

  // Templates (Admin)
  server.post('/admin/templates', async (req, reply) => { const r = await tmplSvc.createTemplate(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/admin/templates', async () => ({ templates: await safeRead(() => tmplSvc.listTemplates(), []) }));
  server.get('/admin/templates/:id/attributes', async (req, reply) => { reply.send({ attributes: await safeRead(() => tmplSvc.getAttributes((req.params as any).id), []) }); });
  server.post('/admin/templates/:id/attributes', async (req, reply) => { const r = await tmplSvc.addAttribute({ ...(req.body as any), templateId: (req.params as any).id }); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.put('/admin/attributes/:id', async (req, reply) => { const r = await tmplSvc.updateAttribute((req.params as any).id, req.body as any); if (!r.ok) return reply.status(r.error.category === 'not_found' ? 404 : 400).send({ error: r.error }); reply.send(r.value); });
  server.delete('/admin/attributes/:id', async (req, reply) => { await tmplSvc.deleteAttribute((req.params as any).id); reply.status(204).send(); });

  // Items
  server.get('/items', async (req, reply) => { const q = req.query as any; if (q.search) return reply.send({ items: await safeRead(() => itemSvc.search(q.search), []) }); if (q.categoryId) return reply.send({ items: await safeRead(() => itemSvc.listByCategory(q.categoryId, { limit: q.limit ? parseInt(q.limit) : undefined, sort: q.sort }), []) }); reply.send({ items: [] }); });
  server.get('/items/:slug', async (req, reply) => { const item = await safeRead(() => itemSvc.getBySlug((req.params as any).slug), null); if (!item) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(item); });
  server.post('/items', async (req, reply) => { const r = await itemSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });

  // Compare (returns template + items)
  server.post('/compare', async (req, reply) => { const b = req.body as any; const items = await safeRead(() => itemSvc.compare(b.itemIds ?? []), []); const template = b.categoryId ? await safeRead(() => tmplSvc.getTemplateByCategory(b.categoryId), null) : null; reply.send({ items, template }); });

  // Saved Comparisons
  server.post('/comparisons', async (req, reply) => { const r = await compSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/comparisons', async (req, reply) => { reply.send({ comparisons: await compSvc.listByUser((req.query as any).userId) }); });
  server.get('/comparisons/shared/:token', async (req, reply) => { const c = await compSvc.getByShareToken((req.params as any).token); if (!c) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(c); });

  // Search
  server.get('/search', async (req, reply) => {
    const query = String((req.query as any).q ?? '').trim();
    if (!query) {
      return reply.send({ results: { query: '', items: [], categories: [], brands: [] } });
    }

    const results = await safeRead(() => searchSvc.search(query), { query, items: [], categories: [], brands: [] });
    return reply.send({ results });
  });

  // Register merchant/brand sub-routes
  await server.register(merchantBrandRoutes);
}
