/**
 * Secure Client Environment Connectivity Engine routes (migration 050).
 * Staff-only, same Admin.Access precedent as every other capability this
 * session.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ConnectionSecurityService, ConnectionSecurityOwnershipError } from '../services/connection-security-service.js';
import { IntegrationAllowlistService } from '../services/integration-allowlist-service.js';
import { SecurityReportService } from '../services/security-report-service.js';
import { getAuth } from '../middleware/auth.js';

export async function connectionSecurityRoutes(server: FastifyInstance): Promise<void> {
  const security = new ConnectionSecurityService();
  const allowlist = new IntegrationAllowlistService();
  const reports = new SecurityReportService();

  server.get('/oc/clients/:clientId/connection-security', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { profiles: await security.listForClient(clientId) };
  });

  server.get('/oc/clients/:clientId/connection-security/:sourceType/:sourceId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, sourceType, sourceId } = req.params as { clientId: string; sourceType: string; sourceId: string };
    try {
      reply.send(await security.getOrCreate(clientId, sourceType as any, sourceId));
    } catch (err) {
      // SECURITY FIX (security_test_1): a real cross-client ownership
      // mismatch — same 404 shape as "doesn't exist" so this route can't
      // be used to probe whether a given sourceId belongs to someone else.
      if (err instanceof ConnectionSecurityOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } }); return; }
      reply.status(500).send({ error: { code: 'internal_error', message: (err as Error).message } });
    }
  });

  server.patch('/oc/clients/:clientId/connection-security/:sourceType/:sourceId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, sourceType, sourceId } = req.params as { clientId: string; sourceType: string; sourceId: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      const updated = await security.updateProfile(sourceType as any, sourceId, req.body as any, actor, clientId);
      reply.send(updated);
    } catch (err) {
      // SECURITY FIX (security_test_1): same ownership-mismatch handling as
      // the GET above — 404, not 400, so it isn't distinguishable from "no
      // such resource" and never confirms another client's data exists.
      if (err instanceof ConnectionSecurityOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } }); return; }
      reply.status(400).send({ error: { code: 'update_failed', message: (err as Error).message } });
    }
  });

  server.get('/oc/clients/:clientId/integration-allowlist', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { allowlist: await allowlist.list(clientId) };
  });

  server.post('/oc/clients/:clientId/integration-allowlist/:provider', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, provider } = req.params as { clientId: string; provider: string };
    const { scope } = req.body as { scope?: string };
    const actor = getAuth(req)?.userId ?? null;
    reply.status(201).send(await allowlist.enable(clientId, provider, scope || '', actor));
  });

  server.delete('/oc/clients/:clientId/integration-allowlist/:provider', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, provider } = req.params as { clientId: string; provider: string };
    const updated = await allowlist.disable(clientId, provider);
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'Allowlist entry not found' } });
    reply.send(updated);
  });

  server.get('/oc/clients/:clientId/security-report', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return reports.generateReport(clientId);
  });
}
