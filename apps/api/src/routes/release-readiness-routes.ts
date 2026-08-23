/**
 * Release Readiness Engine routes — release_readiness_test_1 (2026-08-24).
 * Staff-only (Admin.Access-gated in rules.ts), same precedent as
 * migration/lifecycle routes — this is AskABD's own internal go/no-go
 * decision before flipping a client to go-live, not a client-facing flow.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReleaseReadinessService, ReleaseNotReadyError } from '../services/release-readiness-service.js';
import { getAuth } from '../middleware/auth.js';

export async function releaseReadinessRoutes(server: FastifyInstance): Promise<void> {
  const service = new ReleaseReadinessService();

  server.get('/oc/clients/:clientId/release-readiness', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return service.getReadiness(clientId);
  });

  server.get('/oc/clients/:clientId/release-readiness/signoff', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return service.getSignoffStatus(clientId);
  });

  server.post('/oc/clients/:clientId/release-readiness/signoff/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.status(201).send(await service.requestReleaseSignoff(clientId, actor));
    } catch (err) {
      if (err instanceof ReleaseNotReadyError) {
        return reply.status(409).send({ error: { code: 'release_not_ready', message: err.message, blockers: err.blockers } });
      }
      reply.status(400).send({ error: { code: 'release_signoff_error', message: (err as Error).message } });
    }
  });

  server.post('/oc/clients/:clientId/release-readiness/signoff/:workflowId/:decision', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, workflowId, decision } = req.params as { clientId: string; workflowId: string; decision: string };
    if (!['approve', 'reject', 'request_changes'].includes(decision)) {
      return reply.status(400).send({ error: { code: 'invalid_decision', message: `decision must be one of approve, reject, request_changes` } });
    }
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.send(await service.decideSignoff(workflowId, clientId, decision as 'approve' | 'reject' | 'request_changes', actor, body.note));
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found for this client')) {
        return reply.status(404).send({ error: { code: 'not_found', message } });
      }
      reply.status(400).send({ error: { code: 'release_signoff_error', message } });
    }
  });
}
