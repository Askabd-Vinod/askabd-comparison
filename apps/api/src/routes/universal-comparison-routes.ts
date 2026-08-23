/**
 * Universal Comparison Engine routes (migration 048,
 * universal-comparison-engine.ts). Staff-managed, same RBAC precedent as
 * every other capability this session. Configuration-snapshot routes
 * (migration 052) added here rather than a separate route file — they're
 * the input side of the same engine's second real comparison type, not a
 * separate feature surface.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UniversalComparisonEngine } from '../services/universal-comparison-engine.js';
import { ConfigurationSnapshotService } from '../services/configuration-snapshot-service.js';
import { getAuth } from '../middleware/auth.js';

export async function universalComparisonRoutes(server: FastifyInstance): Promise<void> {
  const engine = new UniversalComparisonEngine();
  const snapshots = new ConfigurationSnapshotService();

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

  server.post('/oc/clients/:clientId/comparisons/configuration', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { leftSnapshotId?: string; rightSnapshotId?: string };
    if (!body.leftSnapshotId || !body.rightSnapshotId) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'leftSnapshotId and rightSnapshotId are required' } });
    }
    const actor = getAuth(req)?.userId ?? null;
    try {
      const run = await engine.runConfigurationComparison(clientId, body.leftSnapshotId, body.rightSnapshotId, actor);
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

  // ─── Configuration Snapshots (migration 052) — the real input side of the configuration comparison type
  server.get('/oc/clients/:clientId/configuration-snapshots', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { snapshots: await snapshots.list(clientId) };
  });

  server.post('/oc/clients/:clientId/configuration-snapshots', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { name?: string; environment?: string; config?: Record<string, string> };
    if (!body.name || !body.environment || !body.config) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'name, environment, and config are required' } });
    }
    const actor = getAuth(req)?.userId ?? null;
    try {
      const snapshot = await snapshots.create(clientId, { name: body.name, environment: body.environment, config: body.config }, actor);
      reply.status(201).send({ snapshot });
    } catch (err) {
      reply.status(400).send({ error: { code: 'invalid_snapshot', message: (err as Error).message } });
    }
  });
}
