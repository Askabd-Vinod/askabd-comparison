/**
 * Executive Reporting Engine routes — `executive_reporting_test_1`
 * (2026-08-24). Staff-only (Admin.Access-gated) — same precedent as
 * every other cross-domain aggregation route this session.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ExecutiveReportingEngine, ExecutiveReportOwnershipError } from '../services/executive-reporting-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ExecutiveReportOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Report not found.' } }); return; }
  reply.status(400).send({ error: { code: 'executive_report_error', message: (err as Error).message } });
}

export async function executiveReportingRoutes(server: FastifyInstance): Promise<void> {
  const reports = new ExecutiveReportingEngine();

  server.get('/oc/clients/:clientId/executive-reports', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { reports: await reports.listReports(clientId) };
  });

  server.post('/oc/clients/:clientId/executive-reports', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await reports.generateReport(clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/executive-reports/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await reports.getReport(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/executive-reports/:id/export/markdown', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try {
      const md = await reports.exportMarkdown(id, clientId);
      reply.header('Content-Type', 'text/markdown').send(md);
    } catch (err) { handleServiceError(err, reply); }
  });
}
