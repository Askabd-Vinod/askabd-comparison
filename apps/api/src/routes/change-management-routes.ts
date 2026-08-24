/**
 * Change Management Engine routes — `change_management_test_1`
 * (2026-08-24). Staff-only (Admin.Access-gated) — same precedent as
 * migration/deployment/risk routes.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ChangeManagementEngine, ChangeOwnershipError, InvalidChangeTransitionError, SelfApprovalError,
  type ChangeStatus,
} from '../services/change-management-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ChangeOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } }); return; }
  if (err instanceof InvalidChangeTransitionError) { reply.status(409).send({ error: { code: 'invalid_transition', message: err.message } }); return; }
  if (err instanceof SelfApprovalError) { reply.status(403).send({ error: { code: 'self_approval_forbidden', message: err.message } }); return; }
  reply.status(400).send({ error: { code: 'change_error', message: (err as Error).message } });
}

export async function changeManagementRoutes(server: FastifyInstance): Promise<void> {
  const changes = new ChangeManagementEngine();

  server.get('/oc/clients/:clientId/changes', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    const { status } = (req.query as { status?: string }) ?? {};
    return { changes: await changes.listChanges(clientId, status as ChangeStatus | undefined) };
  });

  server.post('/oc/clients/:clientId/changes', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await changes.createChange(clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/changes/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await changes.getChange(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/assess', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await changes.assess(id, clientId, actor, body)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/link-risk', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { riskId?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.riskId) return reply.status(400).send({ error: { code: 'risk_id_required', message: 'riskId is required.' } });
    try { reply.send(await changes.linkRisk(id, clientId, body.riskId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/link-deployment', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { deploymentId?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.deploymentId) return reply.status(400).send({ error: { code: 'deployment_id_required', message: 'deploymentId is required.' } });
    try { reply.send(await changes.linkDeployment(id, clientId, body.deploymentId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/request-approval', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await changes.requestApproval(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/changes/:id/approval', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await changes.getApprovalStatus(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/approval/:decision', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id, decision } = req.params as { clientId: string; id: string; decision: string };
    if (!['approve', 'reject', 'request_changes'].includes(decision)) {
      return reply.status(400).send({ error: { code: 'invalid_decision', message: 'decision must be one of approve, reject, request_changes' } });
    }
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await changes.decideApproval(id, clientId, decision as 'approve' | 'reject' | 'request_changes', actor, body.note)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/start-implementation', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await changes.startImplementation(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/validate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { validationReference?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await changes.moveToValidating(id, clientId, actor, body.validationReference)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/close', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { postChangeValidation?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await changes.close(id, clientId, actor, body.postChangeValidation || '')); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/changes/:id/cancel', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { reason?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await changes.cancel(id, clientId, actor, body.reason || '')); } catch (err) { handleServiceError(err, reply); }
  });
}
