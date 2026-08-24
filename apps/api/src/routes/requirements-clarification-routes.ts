/**
 * Requirements Clarification Engine routes —
 * `requirements_clarification_test_1` (2026-08-24). Staff-side generation
 * and management under `/oc/clients/:clientId/requirements/:requirementId/
 * clarifications*` (Admin.Access-gated) — a customer-portal answer
 * endpoint (`/oc/portal/:clientId/clarifications/:id/answer`) is included
 * since the whole point of a clarification is that the CLIENT answers it,
 * matching the same staff-vs-portal split as `client-requests-routes.ts`.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  RequirementsClarificationEngine, RequirementOwnershipError, ClarificationOwnershipError,
  type ClarificationStatus,
} from '../services/requirements-clarification-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof RequirementOwnershipError || err instanceof ClarificationOwnershipError) {
    reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    return;
  }
  reply.status(400).send({ error: { code: 'clarification_error', message: (err as Error).message } });
}

export async function requirementsClarificationRoutes(server: FastifyInstance): Promise<void> {
  const clarifications = new RequirementsClarificationEngine();

  // ─── Staff management ────────────────────────────────────────────────
  server.post('/oc/clients/:clientId/requirements/:requirementId/clarifications/generate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, requirementId } = req.params as { clientId: string; requirementId: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send({ clarifications: await clarifications.generateClarifications(requirementId, clientId, actor) }); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/requirements/:requirementId/clarifications', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, requirementId } = req.params as { clientId: string; requirementId: string };
    try { reply.send({ clarifications: await clarifications.listForRequirement(requirementId, clientId) }); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/clarifications', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    const { status } = (req.query as { status?: string }) ?? {};
    return { clarifications: await clarifications.listForClient(clientId, status as ClarificationStatus | undefined) };
  });

  server.get('/oc/clients/:clientId/clarifications/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await clarifications.getClarification(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/clarifications/:id/resolve', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { resolution?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await clarifications.resolve(id, clientId, actor, body.resolution || '')); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/clarifications/:id/wont-fix', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { reason?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await clarifications.markWontFix(id, clientId, actor, body.reason || '')); } catch (err) { handleServiceError(err, reply); }
  });

  // ─── Customer-portal path — the client answers ────────────────────────
  server.get('/oc/portal/:clientId/clarifications', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const auth = getAuth(req);
    if (!auth?.userId || !auth?.tenantId) return reply.status(401).send({ error: { code: 'not_authenticated', message: 'Sign in to view clarification questions.' } });
    reply.send({ clarifications: await clarifications.listForClient(clientId) });
  });

  server.post('/oc/portal/:clientId/clarifications/:id/answer', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const auth = getAuth(req);
    if (!auth?.userId || !auth?.tenantId) return reply.status(401).send({ error: { code: 'not_authenticated', message: 'Sign in to answer this question.' } });
    const body = (req.body as { answer?: string } | undefined) ?? {};
    try { reply.send(await clarifications.recordClientAnswer(id, clientId, body.answer || '', auth.userId)); } catch (err) { handleServiceError(err, reply); }
  });
}
