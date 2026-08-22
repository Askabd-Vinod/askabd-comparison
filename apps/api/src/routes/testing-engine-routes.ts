/**
 * Universal Testing & Validation Engine routes. Staff-only, same
 * Admin.Access precedent as every other opaque-ID capability this
 * session. See migration 049 and the four service files for the full
 * architecture write-up.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TestCaseService } from '../services/testing-engine.js';
import { TestExecutionService, MissingEvidenceError } from '../services/test-execution-service.js';
import { TestDefectService, InvalidDefectTransitionError } from '../services/test-defect-service.js';
import { TestReportService } from '../services/test-report-service.js';
import { getAuth } from '../middleware/auth.js';

export async function testingEngineRoutes(server: FastifyInstance): Promise<void> {
  const cases = new TestCaseService();
  const executions = new TestExecutionService();
  const defects = new TestDefectService();
  const reports = new TestReportService();

  // ─── Test Cases ───────────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/test-cases', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { testCases: await cases.list(clientId) };
  });

  server.post('/oc/clients/:clientId/test-cases', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      const testCase = await cases.createManual(clientId, req.body as any, actor);
      reply.status(201).send(testCase);
    } catch (err) {
      reply.status(400).send({ error: { code: 'invalid_test_case', message: (err as Error).message } });
    }
  });

  server.get('/oc/test-cases/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const testCase = await cases.get(id);
    if (!testCase) return reply.status(404).send({ error: { code: 'not_found', message: 'Test case not found' } });
    reply.send(testCase);
  });

  server.patch('/oc/test-cases/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    const updated = await cases.updateStatus(id, status as any);
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'Test case not found' } });
    reply.send(updated);
  });

  const generators: Record<string, (clientId: string, sourceId: string, actor: string | null) => Promise<unknown>> = {
    'business-requirement': (c, s, a) => cases.generateFromBusinessRequirement(c, s, a),
    gap: (c, s, a) => cases.generateFromGap(c, s, a),
    'discovery-extraction': (c, s, a) => cases.generateFromDiscoveryExtraction(c, s, a),
  };
  server.post('/oc/clients/:clientId/test-cases/generate/:sourceKind/:sourceId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, sourceKind, sourceId } = req.params as { clientId: string; sourceKind: string; sourceId: string };
    const generator = generators[sourceKind];
    if (!generator) return reply.status(400).send({ error: { code: 'unknown_source_kind', message: `Unknown source kind "${sourceKind}". Supported: ${Object.keys(generators).join(', ')}.` } });
    const actor = getAuth(req)?.userId ?? null;
    try {
      const generated = await generator(clientId, sourceId, actor);
      reply.status(201).send({ generated });
    } catch (err) {
      reply.status(400).send({ error: { code: 'generation_failed', message: (err as Error).message } });
    }
  });

  // ─── Executions ───────────────────────────────────────────────────────
  server.get('/oc/test-cases/:id/executions', async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    return { executions: await executions.getHistory(id) };
  });

  server.post('/oc/clients/:clientId/test-cases/:id/executions', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      const execution = await executions.recordExecution(clientId, id, req.body as any, actor);
      reply.status(201).send(execution);
    } catch (err) {
      const status = err instanceof MissingEvidenceError ? 422 : 400;
      reply.status(status).send({ error: { code: err instanceof MissingEvidenceError ? 'missing_evidence' : 'execution_failed', message: (err as Error).message } });
    }
  });

  server.get('/oc/clients/:clientId/test-executions', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { executions: await executions.listForClient(clientId) };
  });

  server.get('/oc/test-runs/:runIdA/compare/:runIdB', async (req: FastifyRequest) => {
    const { runIdA, runIdB } = req.params as { runIdA: string; runIdB: string };
    return executions.compareRuns(runIdA, runIdB);
  });

  // ─── Defects ──────────────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/test-defects', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { defects: await defects.list(clientId) };
  });

  server.get('/oc/test-defects/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const defect = await defects.get(id);
    if (!defect) return reply.status(404).send({ error: { code: 'not_found', message: 'Test defect not found' } });
    reply.send(defect);
  });

  server.patch('/oc/test-defects/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { status, assignedOwner } = req.body as { status: string; assignedOwner?: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      reply.send(await defects.updateStatus(id, status as any, actor, assignedOwner));
    } catch (err) {
      const code = err instanceof InvalidDefectTransitionError ? 'invalid_transition' : 'update_failed';
      reply.status(400).send({ error: { code, message: (err as Error).message } });
    }
  });

  server.post('/oc/test-defects/:id/retest', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      const result = await executions.retest(id, req.body as any, actor);
      reply.status(201).send(result);
    } catch (err) {
      const status = err instanceof MissingEvidenceError ? 422 : 400;
      reply.status(status).send({ error: { code: 'retest_failed', message: (err as Error).message } });
    }
  });

  // ─── Coverage / Reports ───────────────────────────────────────────────
  server.get('/oc/clients/:clientId/test-coverage', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { coverage: await reports.getCoverageMatrix(clientId) };
  });

  server.get('/oc/clients/:clientId/test-report', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return reports.generateReport(clientId);
  });

  server.get('/oc/clients/:clientId/test-report/export', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const { format, clientName } = req.query as { format?: string; clientName?: string };
    const report = await reports.generateReport(clientId);
    if (format === 'markdown') {
      reply.header('Content-Type', 'text/markdown');
      return reply.send(reports.exportMarkdown(report, clientName || clientId));
    }
    reply.header('Content-Type', 'text/html');
    return reply.send(reports.exportHtml(report, clientName || clientId));
  });

  server.post('/oc/clients/:clientId/test-report/migration-validation', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const { comparisonRunId } = req.body as { comparisonRunId?: string };
    if (!comparisonRunId) return reply.status(400).send({ error: { code: 'missing_fields', message: 'comparisonRunId is required' } });
    const actor = getAuth(req)?.userId ?? null;
    try {
      const result = await reports.runMigrationValidation(clientId, comparisonRunId, actor);
      reply.status(201).send(result);
    } catch (err) {
      reply.status(400).send({ error: { code: 'migration_validation_failed', message: (err as Error).message } });
    }
  });
}
