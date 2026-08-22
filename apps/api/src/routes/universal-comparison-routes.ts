/**
 * Universal Comparison Engine routes (migration 048,
 * universal-comparison-engine.ts). Staff-managed, same RBAC precedent as
 * every other capability this session.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UniversalComparisonEngine } from '../services/universal-comparison-engine.js';
import { getAuth } from '../middleware/auth.js';

export async function universalComparisonRoutes(server: FastifyInstance): Promise<void> {
  const engine = new UniversalComparisonEngine();

  server.get('/oc/clients/:clientId/comparisons', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { runs: await engine.listRuns(clientId) };
  });

  server.post('/oc/clients/:clientId/comparisons/database-schema', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { leftConnectionId?: string; rightConnectionId?: string };
    if (!body.leftConnectionId || !body.rightConnectionId) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'leftConnectionId and rightConnectionId are required' } });
    }
    const actor = getAuth(req)?.userId ?? null;
    try {
      const run = await engine.runDatabaseSchemaComparison(clientId, body.leftConnectionId, body.rightConnectionId, actor);
      reply.status(201).send({ run });
    } catch (err) {
      reply.status(400).send({ error: { code: 'comparison_failed', message: (err as Error).message } });
    }
  });

  server.get('/oc/comparisons/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const run = await engine.getRun(id);
    if (!run) return reply.status(404).send({ error: { code: 'not_found', message: 'Comparison run not found' } });
    reply.send({ run });
  });
}
