import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../db/connection.js';
import { CategoryService, ItemService, ComparisonService } from '../services/comparison-engine.js';
import { TemplateService } from '../services/template-service.js';
import { merchantBrandRoutes } from './merchant-brand-routes.js';

export async function apiRoutes(server: FastifyInstance): Promise<void> {
  const pool = getPool();
  const catSvc = new CategoryService(pool); const itemSvc = new ItemService(pool);
  const compSvc = new ComparisonService(pool); const tmplSvc = new TemplateService(pool);

  // Categories
  server.get('/categories', async () => ({ categories: await catSvc.list() }));
  server.get('/categories/:slug', async (req, reply) => { const c = await catSvc.getBySlug((req.params as any).slug); if (!c) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(c); });
  server.post('/categories', async (req, reply) => { const r = await catSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/categories/:slug/template', async (req, reply) => { const cat = await catSvc.getBySlug((req.params as any).slug); if (!cat) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send({ template: await tmplSvc.getTemplateByCategory(cat.id) }); });

  // Templates (Admin)
  server.post('/admin/templates', async (req, reply) => { const r = await tmplSvc.createTemplate(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/admin/templates', async () => ({ templates: await tmplSvc.listTemplates() }));
  server.get('/admin/templates/:id/attributes', async (req, reply) => { reply.send({ attributes: await tmplSvc.getAttributes((req.params as any).id) }); });
  server.post('/admin/templates/:id/attributes', async (req, reply) => { const r = await tmplSvc.addAttribute({ ...(req.body as any), templateId: (req.params as any).id }); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.put('/admin/attributes/:id', async (req, reply) => { const r = await tmplSvc.updateAttribute((req.params as any).id, req.body as any); if (!r.ok) return reply.status(r.error.category === 'not_found' ? 404 : 400).send({ error: r.error }); reply.send(r.value); });
  server.delete('/admin/attributes/:id', async (req, reply) => { await tmplSvc.deleteAttribute((req.params as any).id); reply.status(204).send(); });

  // Items
  server.get('/items', async (req, reply) => { const q = req.query as any; if (q.search) return reply.send({ items: await itemSvc.search(q.search) }); if (q.categoryId) return reply.send({ items: await itemSvc.listByCategory(q.categoryId, { limit: q.limit ? parseInt(q.limit) : undefined, sort: q.sort }) }); reply.send({ items: [] }); });
  server.get('/items/:slug', async (req, reply) => { const item = await itemSvc.getBySlug((req.params as any).slug); if (!item) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(item); });
  server.post('/items', async (req, reply) => { const r = await itemSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });

  // Compare (returns template + items)
  server.post('/compare', async (req, reply) => { const b = req.body as any; const items = await itemSvc.compare(b.itemIds ?? []); const template = b.categoryId ? await tmplSvc.getTemplateByCategory(b.categoryId) : null; reply.send({ items, template }); });

  // Saved Comparisons
  server.post('/comparisons', async (req, reply) => { const r = await compSvc.create(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.get('/comparisons', async (req, reply) => { reply.send({ comparisons: await compSvc.listByUser((req.query as any).userId) }); });
  server.get('/comparisons/shared/:token', async (req, reply) => { const c = await compSvc.getByShareToken((req.params as any).token); if (!c) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(c); });

  // Search
  server.get('/search', async (req, reply) => { reply.send({ results: await itemSvc.search((req.query as any).q ?? '') }); });

  // Register merchant/brand sub-routes
  await server.register(merchantBrandRoutes);
}
