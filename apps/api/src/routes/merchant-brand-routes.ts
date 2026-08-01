import { FastifyInstance } from 'fastify';
import { getPrisma } from '../services/prisma-client.js';
import { BrandService, MerchantService } from '../services/merchant-brand-prisma.js';

export async function merchantBrandRoutes(server: FastifyInstance): Promise<void> {
  const prisma = getPrisma(); const brandSvc = new BrandService(prisma); const merchantSvc = new MerchantService(prisma);

  // === Brands (Public) ===
  server.get('/brands', async (req, reply) => { const q = req.query as any; if (q.search) return reply.send({ brands: await brandSvc.search(q.search) }); reply.send({ brands: await brandSvc.list({ status: q.status, limit: q.limit ? parseInt(q.limit) : undefined, offset: q.offset ? parseInt(q.offset) : undefined }) }); });
  server.get('/brands/:slug', async (req, reply) => { const b = await brandSvc.getBySlug((req.params as any).slug); if (!b) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(b); });

  // === Brands (Admin) ===
  server.post('/admin/brands', async (req, reply) => { const r = await brandSvc.create(req.body as any); if (!r.ok) return reply.status(r.error.category === 'conflict' ? 409 : 400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.put('/admin/brands/:id', async (req, reply) => { const r = await brandSvc.update((req.params as any).id, req.body as any); if (!r.ok) return reply.status(r.error.category === 'not_found' ? 404 : 400).send({ error: r.error }); reply.send(r.value); });
  server.post('/admin/brands/:id/archive', async (req, reply) => { await brandSvc.archive((req.params as any).id); reply.status(204).send(); });
  server.post('/admin/brands/:id/restore', async (req, reply) => { await brandSvc.restore((req.params as any).id); reply.status(204).send(); });

  // === Merchants (Public) ===
  server.get('/merchants', async (req, reply) => { const q = req.query as any; if (q.search) return reply.send({ merchants: await merchantSvc.search(q.search) }); reply.send({ merchants: await merchantSvc.list({ status: q.status as any, tenantId: q.tenantId, limit: q.limit ? parseInt(q.limit) : undefined }) }); });
  server.get('/merchants/:id', async (req, reply) => { const m = await merchantSvc.getById((req.params as any).id); if (!m) return reply.status(404).send({ error: { code: 'not_found' } }); reply.send(m); });

  // === Merchants (Registration + Admin) ===
  server.post('/merchants/register', async (req, reply) => { const r = await merchantSvc.register(req.body as any); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.post('/admin/merchants/:id/approve', async (req, reply) => { const r = await merchantSvc.approve((req.params as any).id); if (!r.ok) return reply.status(404).send({ error: r.error }); reply.send(r.value); });
  server.post('/admin/merchants/:id/suspend', async (req, reply) => { const r = await merchantSvc.suspend((req.params as any).id); if (!r.ok) return reply.status(404).send({ error: r.error }); reply.send(r.value); });
  server.post('/admin/merchants/:id/reactivate', async (req, reply) => { const r = await merchantSvc.reactivate((req.params as any).id); if (!r.ok) return reply.status(404).send({ error: r.error }); reply.send(r.value); });

  // === Verification ===
  server.post('/merchants/:id/verification', async (req, reply) => { const r = await merchantSvc.submitVerification({ merchantId: (req.params as any).id, ...(req.body as any) }); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
  server.post('/admin/verifications/:id/review', async (req, reply) => { const b = req.body as any; const r = await merchantSvc.reviewVerification((req.params as any).id, b.decision, b.reviewerId, b.notes); if (!r.ok) return reply.status(404).send({ error: r.error }); reply.send(r.value); });

  // === Branches ===
  server.post('/merchants/:id/branches', async (req, reply) => { const r = await merchantSvc.addBranch({ merchantId: (req.params as any).id, ...(req.body as any) }); if (!r.ok) return reply.status(400).send({ error: r.error }); reply.status(201).send(r.value); });
}
