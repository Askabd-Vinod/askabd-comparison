import { FastifyInstance } from 'fastify';
import { CategoryService } from '../services/category-service.js';
import { ItemService } from '../services/item-service.js';
import { ComparisonService } from '../services/comparison-service.js';
import { TemplateService } from '../services/template-service-prisma.js';
import { SearchService } from '../services/search-service-prisma.js';
import { getPrisma } from '../services/prisma-client.js';
import { merchantBrandRoutes } from './merchant-brand-routes.js';
import { safeQuery } from '../platform/service-utils/index.js';

export async function apiRoutes(server: FastifyInstance): Promise<void> {
  const prisma = getPrisma();
  const catSvc = new CategoryService(prisma);
  const itemSvc = new ItemService(prisma);
  const compSvc = new ComparisonService(prisma);
  const tmplSvc = new TemplateService(prisma);
  const searchSvc = new SearchService(prisma);

  // Categories (Prisma-powered)
  server.get('/categories', async () => ({ categories: await safeQuery(() => catSvc.list(), []) }));
  server.get('/categories/:slug', async (req, reply) => { const c = await safeQuery(() => catSvc.getBySlug((req.params as any).slug), null); if (!c) return reply.status(404).send({ error: { code: 'not_found', message: 'Category not found' } }); reply.send(c); });
  server.post('/categories', async (req, reply) => { const r = await catSvc.create(req.body as any); if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.put('/categories/:id', async (req, reply) => { const r = await catSvc.update((req.params as any).id, req.body as any); if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error }); reply.send(r.value); });
  server.delete('/categories/:id', async (req, reply) => { const r = await catSvc.delete((req.params as any).id); if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error }); reply.status(204).send(); });
  server.get('/categories/:slug/template', async (req, reply) => { const cat = await safeQuery(() => catSvc.getBySlug((req.params as any).slug), null); if (!cat) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send({ template: await safeQuery(() => tmplSvc.getTemplateByCategory(cat.id), null) }); });

  // Templates (Admin)
  server.post('/admin/templates', async (req, reply) => { const r = await tmplSvc.createTemplate(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/admin/templates', async () => ({ templates: await safeQuery(() => tmplSvc.listTemplates(), []) }));
  server.get('/admin/templates/:id/attributes', async (req, reply) => { reply.send({ attributes: await safeQuery(() => tmplSvc.getAttributes((req.params as any).id), []) }); });
  server.post('/admin/templates/:id/attributes', async (req, reply) => { const r = await tmplSvc.addAttribute({ ...(req.body as any), templateId: (req.params as any).id }); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.put('/admin/attributes/:id', async (req, reply) => { const r = await tmplSvc.updateAttribute((req.params as any).id, req.body as any); if (!r.ok) return reply.status(r.error.category === 'not_found' ? 404 : 400).send({ error: r.error }); reply.send(r.value); });
  server.delete('/admin/attributes/:id', async (req, reply) => { await tmplSvc.deleteAttribute((req.params as any).id); reply.status(204).send(); });

  // Items (Prisma-powered)
  server.get('/items', async (req, reply) => { const q = req.query as any; if (q.search) return reply.send({ items: await safeQuery(() => itemSvc.search(q.search), []) }); if (q.categoryId) return reply.send({ items: await safeQuery(() => itemSvc.listByCategory(q.categoryId, { limit: q.limit ? parseInt(q.limit) : undefined, sort: q.sort }), []) }); reply.send({ items: [] }); });
  server.get('/items/:slug', async (req, reply) => { const item = await safeQuery(() => itemSvc.getBySlug((req.params as any).slug), null); if (!item) return reply.status(404).send({ error: { code: 'not_found', message: 'Item not found' } }); reply.send(item); });
  server.post('/items', async (req, reply) => { const r = await itemSvc.create(req.body as any); if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.put('/items/:id', async (req, reply) => { const r = await itemSvc.update((req.params as any).id, req.body as any); if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error }); reply.send(r.value); });
  server.delete('/items/:id', async (req, reply) => { const r = await itemSvc.delete((req.params as any).id); if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error }); reply.status(204).send(); });

  // Compare (returns template + items)
  server.post('/compare', async (req, reply) => { const b = req.body as any; const items = await safeQuery(() => itemSvc.compare(b.itemIds ?? []), []); const template = b.categoryId ? await safeQuery(() => tmplSvc.getTemplateByCategory(b.categoryId), null) : null; reply.send({ items, template }); });

  // Saved Comparisons (Prisma-powered)
  server.post('/comparisons', async (req, reply) => { const r = await compSvc.create(req.body as any); if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/comparisons', async (req, reply) => { reply.send({ comparisons: await compSvc.listByUser((req.query as any).userId) }); });
  server.get('/comparisons/shared/:token', async (req, reply) => { const c = await compSvc.getByShareToken((req.params as any).token); if (!c) return reply.status(404).send({ error: { code: 'not_found', message: 'Comparison not found' } }); reply.send(c); });

  // Search
  server.get('/search', async (req, reply) => {
    const query = String((req.query as any).q ?? '').trim();
    if (!query) {
      return reply.send({ results: { query: '', items: [], categories: [], brands: [] } });
    }

    const results = await safeQuery(() => searchSvc.search(query), { query, items: [], categories: [], brands: [] });
    return reply.send({ results });
  });

  // Register merchant/brand sub-routes
  await server.register(merchantBrandRoutes);
}
