import { FastifyInstance } from 'fastify';
import { getPrisma } from '../services/prisma-client.js';
import { PriceEngine } from '../services/price-engine-prisma.js';
import { safeQuery, sendResult } from '../platform/service-utils/index.js';

export async function priceRoutes(server: FastifyInstance): Promise<void> {
  const prisma = getPrisma();
  const svc = new PriceEngine(prisma);

  // Record a price entry
  server.post('/prices', async (req, reply) => {
    sendResult(reply, await svc.recordPrice(req.body as any), 201);
  });

  // Get price history for an item
  server.get('/items/:itemId/prices', async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const q = req.query as { merchantId?: string; limit?: string };
    const prices = await safeQuery(() => svc.getPriceHistory(itemId, { merchantId: q.merchantId, limit: q.limit ? parseInt(q.limit) : undefined }), []);
    reply.send({ prices });
  });

  // Get lowest price for an item
  server.get('/items/:itemId/prices/lowest', async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const price = await safeQuery(() => svc.getLowestPrice(itemId), null);
    if (!price) return reply.status(404).send({ error: { code: 'not_found', message: 'No prices found', statusCode: 404 } });
    reply.send(price);
  });

  // Get merchant prices for an item (one per merchant, latest)
  server.get('/items/:itemId/prices/merchants', async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const prices = await safeQuery(() => svc.getMerchantPrices(itemId), []);
    reply.send({ prices });
  });

  // Create an offer
  server.post('/offers', async (req, reply) => {
    sendResult(reply, await svc.createOffer(req.body as any), 201);
  });

  // Get active offers for an item
  server.get('/items/:itemId/offers', async (req, reply) => {
    const { itemId } = req.params as { itemId: string };
    const offers = await safeQuery(() => svc.getActiveOffers(itemId), []);
    reply.send({ offers });
  });

  // Get trending deals (all items)
  server.get('/offers/trending', async (req, reply) => {
    const q = req.query as { limit?: string };
    const offers = await safeQuery(() => svc.getTrendingDeals(q.limit ? parseInt(q.limit) : undefined), []);
    reply.send({ offers });
  });
}
