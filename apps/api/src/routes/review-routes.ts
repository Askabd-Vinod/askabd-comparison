import { FastifyInstance } from 'fastify';
import { getPrisma } from '../services/prisma-client.js';
import { ReviewService } from '../services/review-service-prisma.js';
import { safeQuery, sendResult } from '../platform/service-utils/index.js';

export async function reviewRoutes(server: FastifyInstance): Promise<void> {
  const prisma = getPrisma();
  const svc = new ReviewService(prisma);

  // Get reviews for an item
  server.get('/items/:itemId/reviews', async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const q = req.query as { limit?: string; offset?: string };
    const reviews = await safeQuery(() => svc.getByItem(itemId, { limit: q.limit ? parseInt(q.limit) : undefined, offset: q.offset ? parseInt(q.offset) : undefined }), []);
    reply.send({ reviews });
  });

  // Get review stats for an item
  server.get('/items/:itemId/reviews/stats', async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const stats = await safeQuery(() => svc.getStats(itemId), { averageRating: 0, totalReviews: 0, distribution: {} });
    reply.send(stats);
  });

  // Create a review
  server.post('/reviews', async (req, reply) => {
    sendResult(reply, await svc.create(req.body as any), 201);
  });

  // Mark review as helpful
  server.post('/reviews/:id/helpful', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await svc.markHelpful(id);
    if (!r.ok) return reply.status(r.error.statusCode ?? 400).send({ error: r.error });
    reply.status(204).send();
  });

  // Admin: Get pending reviews
  server.get('/admin/reviews/pending', async (_req, reply) => {
    const reviews = await safeQuery(() => svc.getPending(), []);
    reply.send({ reviews });
  });

  // Admin: Moderate a review
  server.post('/admin/reviews/:id/moderate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { decision } = req.body as { decision: 'approve' | 'reject' };
    sendResult(reply, await svc.moderate(id, decision));
  });
}
