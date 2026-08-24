/**
 * Risk Engine routes — `risk_test_1` (2026-08-24). Staff-only
 * (Admin.Access-gated in rules.ts) — risk management is AskABD's own
 * internal operational action, same precedent as migration/lifecycle/
 * release-readiness/deployment routes.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  RiskEngine, RiskOwnershipError, InvalidRiskTransitionError, InvalidSourceLinkError, AcceptanceNotDecidedError,
  type RiskStatus,
} from '../services/risk-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof RiskOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Risk not found.' } }); return; }
  if (err instanceof InvalidRiskTransitionError) { reply.status(409).send({ error: { code: 'invalid_transition', message: err.message } }); return; }
  if (err instanceof InvalidSourceLinkError) { reply.status(400).send({ error: { code: 'invalid_source_link', message: err.message } }); return; }
  if (err instanceof AcceptanceNotDecidedError) { reply.status(409).send({ error: { code: 'acceptance_not_requested', message: err.message } }); return; }
  reply.status(400).send({ error: { code: 'risk_error', message: (err as Error).message } });
}

export async function riskRoutes(server: FastifyInstance): Promise<void> {
  const risks = new RiskEngine();

  server.get('/oc/clients/:clientId/risks', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    const { status } = (req.query as { status?: string }) ?? {};
    return { risks: await risks.listRisks(clientId, status as RiskStatus | undefined) };
  });

  server.get('/oc/clients/:clientId/risks/summary', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return risks.getRiskSummary(clientId);
  });

  server.post('/oc/clients/:clientId/risks', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await risks.createRisk(clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/risks/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await risks.getRisk(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.patch('/oc/clients/:clientId/risks/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await risks.updateRisk(id, clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/risks/:id/mitigate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { residualRisk?: any; note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.residualRisk) return reply.status(400).send({ error: { code: 'residual_risk_required', message: 'residualRisk is required.' } });
    try { reply.send(await risks.mitigate(id, clientId, actor, body.residualRisk, body.note)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/risks/:id/reopen', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { reason?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await risks.reopen(id, clientId, actor, body.reason || '')); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/risks/:id/transfer', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await risks.transfer(id, clientId, actor, body.note || '')); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/risks/:id/close', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { reason?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await risks.close(id, clientId, actor, body.reason || '')); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/risks/:id/acceptance/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { justification?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await risks.requestAcceptance(id, clientId, actor, body.justification || '')); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/risks/:id/acceptance', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await risks.getAcceptanceStatus(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/risks/:id/acceptance/:decision', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id, decision } = req.params as { clientId: string; id: string; decision: string };
    if (!['approve', 'reject'].includes(decision)) {
      return reply.status(400).send({ error: { code: 'invalid_decision', message: 'decision must be "approve" or "reject"' } });
    }
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await risks.decideAcceptance(id, clientId, decision as 'approve' | 'reject', actor, body.note)); } catch (err) { handleServiceError(err, reply); }
  });
}
