/**
 * API Discovery / Validation Engine routes — `api_discovery_test_1`
 * (2026-08-24). Staff-only (Admin.Access-gated) — live validation can
 * trigger a real outbound request, same precedent as every other
 * connector-touching route this session.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ApiDiscoveryEngine, ApiSpecOwnershipError, InvalidSpecError, LiveValidationNotAuthorizedError,
} from '../services/api-discovery-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ApiSpecOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } }); return; }
  if (err instanceof InvalidSpecError) { reply.status(400).send({ error: { code: 'invalid_spec', message: err.message } }); return; }
  if (err instanceof LiveValidationNotAuthorizedError) { reply.status(403).send({ error: { code: 'live_validation_not_authorized', message: err.message } }); return; }
  reply.status(400).send({ error: { code: 'api_discovery_error', message: (err as Error).message } });
}

export async function apiDiscoveryRoutes(server: FastifyInstance): Promise<void> {
  const discovery = new ApiDiscoveryEngine();

  server.get('/oc/clients/:clientId/api-specs', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { specs: await discovery.listSpecs(clientId) };
  });

  server.post('/oc/clients/:clientId/api-specs', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await discovery.ingestSpec(clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/api-specs/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await discovery.getSpec(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/api-specs/:id/endpoints', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send({ endpoints: await discovery.listEndpoints(id, clientId) }); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/api-specs/:id/gap-report', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await discovery.getGapReport(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/api-specs/:id/authorize-live-validation', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as { authorized?: boolean } | undefined) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await discovery.setLiveValidationAuthorized(id, clientId, !!body.authorized, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/api-endpoints/:endpointId/validate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, endpointId } = req.params as { clientId: string; endpointId: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await discovery.validateEndpoint(endpointId, clientId, actor)); } catch (err) { handleServiceError(err, reply); }
  });
}
