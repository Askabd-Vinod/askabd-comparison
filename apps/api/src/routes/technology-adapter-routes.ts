/**
 * Technology Adapter Registry routes (migration 051,
 * technology-adapter-registry.ts). Staff-managed, same RBAC precedent as
 * every other capability this session — read-only listing/lookup for now;
 * registration of new adapters is a real, deliberate fast-follow once a
 * real UI for it exists (today `register()` is used only by seed data and
 * future engine-authored adapters, not exposed over HTTP to avoid an
 * unreviewed way to claim a technology is "supported").
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TechnologyAdapterRegistry, AdapterCategory } from '../services/technology-adapter-registry.js';

export async function technologyAdapterRoutes(server: FastifyInstance): Promise<void> {
  const registry = new TechnologyAdapterRegistry();

  server.get('/oc/technology-adapters', async (req: FastifyRequest) => {
    const { category } = req.query as { category?: AdapterCategory };
    return { adapters: await registry.list(category) };
  });

  server.get('/oc/technology-adapters/:category/:technology', async (req: FastifyRequest, reply: FastifyReply) => {
    const { category, technology } = req.params as { category: AdapterCategory; technology: string };
    const result = await registry.checkCompatibility(technology, category);
    reply.send({ compatibility: result });
  });
}
