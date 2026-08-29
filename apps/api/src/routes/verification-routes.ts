/**
 * AskABD Verification & Validation Automation Service routes
 * (`verification_service_test_1`, 2026-08-29). Staff-only (Admin.Access) —
 * same precedent as every other internal-operations surface this session.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VerificationService } from '../services/verification-service.js';
import { getAuth } from '../middleware/auth.js';

export async function verificationRoutes(server: FastifyInstance): Promise<void> {
  const verification = new VerificationService();

  server.get('/oc/verification/services', async () => {
    return { services: await verification.listServices() };
  });

  server.get('/oc/verification/services/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const service = await verification.getService(id);
    if (!service) return reply.status(404).send({ error: { code: 'not_found', message: 'Service not found.' } });
    reply.send(service);
  });

  server.get('/oc/verification/runs', async (req: FastifyRequest) => {
    const { limit } = (req.query as { limit?: string }) ?? {};
    return { runs: await verification.listRuns(limit ? parseInt(limit, 10) : undefined) };
  });

  server.get('/oc/verification/runs/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = await verification.getRun(id);
    if (!result) return reply.status(404).send({ error: { code: 'not_found', message: 'Run not found.' } });
    reply.send(result);
  });

  server.post('/oc/verification/runs/health-check', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body as { environment?: string } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? undefined;
    try {
      const run = await verification.runDeepHealthCheck({ initiatedBy: actor, environment: body.environment, trigger: 'on_demand' });
      reply.status(201).send(run);
    } catch (err) {
      reply.status(500).send({ error: { code: 'health_check_error', message: (err as Error).message } });
    }
  });

  server.post('/oc/verification/runs/record-external-result', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { suiteName?: string; totalFiles?: number; passedFiles?: number; totalTests?: number; passedTests?: number; failedTests?: number; environment?: string; trigger?: any };
    if (!body.suiteName || typeof body.totalTests !== 'number' || typeof body.passedTests !== 'number') {
      return reply.status(400).send({ error: { code: 'invalid_input', message: 'suiteName, totalTests, and passedTests are required.' } });
    }
    const actor = getAuth(req)?.userId ?? undefined;
    try {
      const run = await verification.recordExternalResult({
        initiatedBy: actor, environment: body.environment, trigger: body.trigger,
        suiteName: body.suiteName, totalFiles: body.totalFiles ?? 0, passedFiles: body.passedFiles ?? 0,
        totalTests: body.totalTests, passedTests: body.passedTests, failedTests: body.failedTests ?? (body.totalTests - body.passedTests),
      });
      reply.status(201).send(run);
    } catch (err) {
      reply.status(500).send({ error: { code: 'record_result_error', message: (err as Error).message } });
    }
  });

  server.get('/oc/verification/regressions', async () => {
    return verification.detectRegressions();
  });
}
