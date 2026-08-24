/**
 * Dependency Analysis Engine routes — `dependency_analysis_test_1`
 * (2026-08-24). Staff-only (Admin.Access-gated) — same precedent as
 * every other cross-domain analysis route this session. Reuses
 * `TraceabilityEngine.link/unlink` (unmodified) for creating/removing the
 * real `depends_on` links this engine analyzes — no separate creation
 * endpoint duplicated here.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DependencyAnalysisEngine, UnverifiableEntityTypeError, DependencyOwnershipError } from '../services/dependency-analysis-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof DependencyOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: err.message } }); return; }
  if (err instanceof UnverifiableEntityTypeError) { reply.status(400).send({ error: { code: 'unverifiable_entity_type', message: err.message } }); return; }
  reply.status(400).send({ error: { code: 'dependency_analysis_error', message: (err as Error).message } });
}

export async function dependencyAnalysisRoutes(server: FastifyInstance): Promise<void> {
  const dependencies = new DependencyAnalysisEngine();

  server.post('/oc/clients/:clientId/dependencies/link', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as { sourceType?: string; sourceId?: string; targetType?: string; targetId?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.sourceType || !body.sourceId || !body.targetType || !body.targetId) {
      return reply.status(400).send({ error: { code: 'fields_required', message: 'sourceType, sourceId, targetType, targetId are all required.' } });
    }
    try {
      reply.status(201).send(await dependencies.createDependencyLink(clientId, body.sourceType, body.sourceId, body.targetType, body.targetId, actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/dependencies/:entityType/:entityId/cycles', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, entityType, entityId } = req.params as { clientId: string; entityType: string; entityId: string };
    try { reply.send(await dependencies.detectCycles(entityType, entityId, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/dependencies/:entityType/:entityId/impact', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, entityType, entityId } = req.params as { clientId: string; entityType: string; entityId: string };
    try { reply.send(await dependencies.getDependencyImpact(entityType, entityId, clientId)); } catch (err) { handleServiceError(err, reply); }
  });
}
