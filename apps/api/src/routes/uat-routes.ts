/**
 * UAT Engine routes — uat_test_1 (2026-08-24 master directive pass).
 *
 * Same staff-vs-portal split as client-requests-routes.ts / crm-routes.ts:
 *   - Staff management (`/oc/clients/:clientId/uat*`) — Admin.Access-gated
 *     in platform/rbac/rules.ts, same precedent as testing-engine-routes.ts.
 *   - Customer-portal path (`/oc/portal/:clientId/uat*`) — unlisted, falls
 *     to defaultPolicy 'authenticated' + tenant-access.ts's real membership
 *     check, matching every other /oc/portal/:clientId/* route. This is
 *     deliberate: the CLIENT is the one who executes UAT test cases and
 *     decides sign-off — that is the entire point of this engine.
 *
 * Every handler delegates ownership verification to UatService itself
 * (never trusts an opaque cycle/workflow id alone) — see
 * uat-service.ts's getOwnedCycle / getOwnedSignoffWorkflow.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UatService, UatCycleOwnershipError, SignoffNotReadyError } from '../services/uat-service.js';
import { MissingEvidenceError } from '../services/test-execution-service.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof UatCycleOwnershipError) {
    // Same shape as "not found" — never disclose "exists but isn't yours".
    reply.status(404).send({ error: { code: 'not_found', message: 'UAT cycle not found.' } });
    return;
  }
  if (err instanceof SignoffNotReadyError) {
    reply.status(409).send({ error: { code: 'signoff_not_ready', message: (err as Error).message } });
    return;
  }
  if (err instanceof MissingEvidenceError) {
    reply.status(400).send({ error: { code: 'missing_evidence', message: (err as Error).message } });
    return;
  }
  reply.status(400).send({ error: { code: 'uat_error', message: (err as Error).message } });
}

export async function uatRoutes(server: FastifyInstance): Promise<void> {
  const uat = new UatService();

  // ─── Staff management ────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/uat/cycles', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { cycles: await uat.listCycles(clientId) };
  });

  server.post('/oc/clients/:clientId/uat/cycles', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as { name?: string; description?: string; testCaseIds?: string[] } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      const cycle = await uat.createCycle(clientId, body.name ?? '', body.description ?? '', body.testCaseIds ?? [], actor);
      reply.status(201).send(cycle);
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  server.get('/oc/clients/:clientId/uat/cycles/:cycleId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, cycleId } = req.params as { clientId: string; cycleId: string };
    try {
      reply.send(await uat.getCycle(cycleId, clientId));
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  server.get('/oc/clients/:clientId/uat/cycles/:cycleId/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, cycleId } = req.params as { clientId: string; cycleId: string };
    try {
      const [testCases, progress, signoff] = await Promise.all([
        uat.getTestCaseStatuses(cycleId, clientId),
        uat.getProgress(cycleId, clientId),
        uat.getSignoffStatus(cycleId, clientId),
      ]);
      reply.send({ testCases, progress, signoff });
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  server.post('/oc/clients/:clientId/uat/cycles/:cycleId/signoff/:workflowId/approve', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, workflowId } = req.params as { clientId: string; cycleId: string; workflowId: string };
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.send(await uat.approveSignoff(workflowId, clientId, actor, body.note));
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  server.post('/oc/clients/:clientId/uat/cycles/:cycleId/signoff/:workflowId/reject', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, workflowId } = req.params as { clientId: string; cycleId: string; workflowId: string };
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.send(await uat.rejectSignoff(workflowId, clientId, actor, body.note ?? ''));
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  server.post('/oc/clients/:clientId/uat/cycles/:cycleId/signoff/:workflowId/request-changes', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, workflowId } = req.params as { clientId: string; cycleId: string; workflowId: string };
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.send(await uat.requestSignoffChanges(workflowId, clientId, actor, body.note ?? ''));
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  // ─── Customer-portal path ────────────────────────────────────────────
  server.get('/oc/portal/:clientId/uat/cycles', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const auth = getAuth(req);
    if (!auth?.userId || !auth?.tenantId) {
      return reply.status(401).send({ error: { code: 'not_authenticated', message: 'Sign in to view UAT cycles.' } });
    }
    reply.send({ cycles: await uat.listCycles(clientId) });
  });

  server.get('/oc/portal/:clientId/uat/cycles/:cycleId/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, cycleId } = req.params as { clientId: string; cycleId: string };
    try {
      const [testCases, progress, signoff] = await Promise.all([
        uat.getTestCaseStatuses(cycleId, clientId),
        uat.getProgress(cycleId, clientId),
        uat.getSignoffStatus(cycleId, clientId),
      ]);
      reply.send({ testCases, progress, signoff });
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  server.post('/oc/portal/:clientId/uat/cycles/:cycleId/test-cases/:testCaseId/executions', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, cycleId, testCaseId } = req.params as { clientId: string; cycleId: string; testCaseId: string };
    const auth = getAuth(req);
    if (!auth?.userId || !auth?.tenantId) {
      return reply.status(401).send({ error: { code: 'not_authenticated', message: 'Sign in to record a UAT result.' } });
    }
    try {
      const execution = await uat.recordExecution(cycleId, clientId, testCaseId, (req.body as any) ?? {}, auth.userId);
      reply.status(201).send(execution);
    } catch (err) {
      handleServiceError(err, reply);
    }
  });

  server.post('/oc/portal/:clientId/uat/cycles/:cycleId/signoff/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, cycleId } = req.params as { clientId: string; cycleId: string };
    const auth = getAuth(req);
    if (!auth?.userId || !auth?.tenantId) {
      return reply.status(401).send({ error: { code: 'not_authenticated', message: 'Sign in to request sign-off.' } });
    }
    try {
      reply.status(201).send(await uat.requestSignoff(cycleId, clientId, auth.userId));
    } catch (err) {
      handleServiceError(err, reply);
    }
  });
}
