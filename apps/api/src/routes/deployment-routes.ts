/**
 * Deployment + Post-Deployment Validation Engine routes —
 * `deployment_validation_test_1` / `post_delivery_test_1` (2026-08-24).
 *
 * Staff-only (Admin.Access-gated in rules.ts) — same precedent as
 * migration/lifecycle/release-readiness routes: deployment execution is
 * AskABD's own internal operational action, not something a customer
 * portal user triggers. Every handler delegates real object-level
 * ownership verification to DeploymentService itself (never trusts an
 * opaque deployment/workflow id alone).
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  DeploymentService, DeploymentOwnershipError, InvalidDeploymentTransitionError,
  ReadinessGateError, SelfApprovalError, RollbackNotAvailableError, DeploymentNotDeletableError,
  type DeploymentStatus, type PostDeploymentCheckName,
} from '../services/deployment-service.js';
import { MissingEvidenceError } from '../services/test-execution-service.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof DeploymentOwnershipError) {
    reply.status(404).send({ error: { code: 'not_found', message: 'Deployment not found.' } });
    return;
  }
  if (err instanceof InvalidDeploymentTransitionError) {
    reply.status(409).send({ error: { code: 'invalid_transition', message: err.message } });
    return;
  }
  if (err instanceof ReadinessGateError) {
    reply.status(409).send({ error: { code: 'readiness_not_met', message: err.message, blockers: err.blockers } });
    return;
  }
  if (err instanceof SelfApprovalError) {
    reply.status(403).send({ error: { code: 'self_approval_forbidden', message: err.message } });
    return;
  }
  if (err instanceof RollbackNotAvailableError) {
    reply.status(409).send({ error: { code: 'rollback_not_available', message: err.message } });
    return;
  }
  if (err instanceof DeploymentNotDeletableError) {
    reply.status(409).send({ error: { code: 'not_deletable', message: err.message } });
    return;
  }
  if (err instanceof MissingEvidenceError) {
    reply.status(400).send({ error: { code: 'missing_evidence', message: err.message } });
    return;
  }
  reply.status(400).send({ error: { code: 'deployment_error', message: (err as Error).message } });
}

export async function deploymentRoutes(server: FastifyInstance): Promise<void> {
  const deployments = new DeploymentService();

  server.get('/oc/clients/:clientId/deployments', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    const { status } = (req.query as { status?: string }) ?? {};
    return { deployments: await deployments.listDeployments(clientId, status as DeploymentStatus | undefined) };
  });

  server.post('/oc/clients/:clientId/deployments', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.status(201).send(await deployments.createDeployment(clientId, body, actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/deployments/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try {
      reply.send(await deployments.getDeployment(id, clientId));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.patch('/oc/clients/:clientId/deployments/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.send(await deployments.updateDeployment(id, clientId, body, actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.delete('/oc/clients/:clientId/deployments/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try {
      await deployments.deleteDeployment(id, clientId);
      reply.status(204).send();
    } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/plan', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await deployments.planDeployment(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/check-readiness', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await deployments.checkReadiness(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/request-approval', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await deployments.requestApproval(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/deployments/:id/approval', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await deployments.getApprovalStatus(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/approval/:decision', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id, decision } = req.params as { clientId: string; id: string; decision: string };
    if (!['approve', 'reject', 'request_changes'].includes(decision)) {
      return reply.status(400).send({ error: { code: 'invalid_decision', message: 'decision must be one of approve, reject, request_changes' } });
    }
    const body = (req.body as { note?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.send(await deployments.decideApproval(id, clientId, decision as 'approve' | 'reject' | 'request_changes', actor, body.note));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/start-execution', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await deployments.startExecution(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/outcome', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { outcome?: 'deployed' | 'failed'; evidence?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.outcome || !['deployed', 'failed'].includes(body.outcome)) {
      return reply.status(400).send({ error: { code: 'invalid_outcome', message: 'outcome must be "deployed" or "failed"' } });
    }
    try {
      reply.send(await deployments.recordDeploymentOutcome(id, clientId, body.outcome, body.evidence || '', actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  // ─── Post-Deployment Validation ────────────────────────────────────
  server.post('/oc/clients/:clientId/deployments/:id/post-deployment/suite', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { checks?: { name: PostDeploymentCheckName; category?: any; expectedResult?: string }[] } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.status(201).send(await deployments.createPostDeploymentSuite(id, clientId, body.checks || [], actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/deployments/:id/post-deployment/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try {
      const [statuses, progress] = await Promise.all([
        deployments.getPostDeploymentStatuses(id, clientId),
        deployments.getPostDeploymentProgress(id, clientId),
      ]);
      reply.send({ checks: statuses, progress });
    } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/post-deployment/checks/:testCaseId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id, testCaseId } = req.params as { clientId: string; id: string; testCaseId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.status(201).send(await deployments.recordPostDeploymentCheck(id, clientId, testCaseId, body, actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/post-deployment/checks/:testCaseId/auto-db-check', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id, testCaseId } = req.params as { clientId: string; id: string; testCaseId: string };
    const body = (req.body as { connectionId?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.connectionId) return reply.status(400).send({ error: { code: 'connection_id_required', message: 'connectionId is required.' } });
    try {
      reply.status(201).send(await deployments.runAutomaticDatabaseConnectivityCheck(id, clientId, testCaseId, body.connectionId, actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/post-deployment/finalize', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await deployments.finalizeValidation(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  // ─── Rollback ──────────────────────────────────────────────────────
  server.post('/oc/clients/:clientId/deployments/:id/rollback/initiate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await deployments.initiateRollback(id, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/rollback/outcome', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { outcome?: 'rolled_back' | 'rollback_failed'; evidence?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.outcome || !['rolled_back', 'rollback_failed'].includes(body.outcome)) {
      return reply.status(400).send({ error: { code: 'invalid_outcome', message: 'outcome must be "rolled_back" or "rollback_failed"' } });
    }
    try {
      reply.send(await deployments.recordRollbackOutcome(id, clientId, body.outcome, body.evidence || '', actor));
    } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/deployments/:id/cancel', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { reason?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await deployments.cancelDeployment(id, clientId, actor, body.reason || '')); } catch (err) { handleServiceError(err, reply); }
  });

  // ─── Comparison (reuses the Universal Comparison Engine) ─────────────
  server.post('/oc/clients/:clientId/deployments/:id/compare', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { preSnapshotId?: string; postSnapshotId?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    if (!body.preSnapshotId || !body.postSnapshotId) {
      return reply.status(400).send({ error: { code: 'snapshots_required', message: 'preSnapshotId and postSnapshotId are required.' } });
    }
    try {
      reply.status(201).send(await deployments.compareDeploymentSnapshots(id, clientId, body.preSnapshotId, body.postSnapshotId, actor));
    } catch (err) { handleServiceError(err, reply); }
  });
}
