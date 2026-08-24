/**
 * Data Mapping Engine routes — `data_mapping_test_1` (2026-08-24). Staff-only
 * (Admin.Access-gated) — same precedent as migration/deployment/risk routes.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  DataMappingEngine, MappingOwnershipError, InvalidMappingShapeError, InvalidMappingStatusTransitionError,
  type MappingSetStatus,
} from '../services/data-mapping-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof MappingOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Mapping not found.' } }); return; }
  if (err instanceof InvalidMappingShapeError) { reply.status(400).send({ error: { code: 'invalid_mapping_shape', message: err.message } }); return; }
  if (err instanceof InvalidMappingStatusTransitionError) { reply.status(409).send({ error: { code: 'invalid_transition', message: err.message } }); return; }
  reply.status(400).send({ error: { code: 'mapping_error', message: (err as Error).message } });
}

export async function dataMappingRoutes(server: FastifyInstance): Promise<void> {
  const mapping = new DataMappingEngine();

  server.get('/oc/clients/:clientId/data-mappings', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { mappingSets: await mapping.listMappingSets(clientId) };
  });

  server.post('/oc/clients/:clientId/data-mappings', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await mapping.createMappingSet(clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/data-mappings/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await mapping.getMappingSet(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/data-mappings/:id/status/:status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id, status } = req.params as { clientId: string; id: string; status: string };
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await mapping.transitionSetStatus(id, clientId, status as MappingSetStatus, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/data-mappings/:id/completeness', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await mapping.getCompleteness(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/data-mappings/:id/fields', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send({ fields: await mapping.listFieldMappings(id, clientId) }); } catch (err) { handleServiceError(err, reply); }
  });

  server.post('/oc/clients/:clientId/data-mappings/:id/fields', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await mapping.addFieldMapping(id, clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/data-mapping-fields/:fieldId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, fieldId } = req.params as { clientId: string; fieldId: string };
    try { reply.send(await mapping.getFieldMapping(fieldId, clientId)); } catch (err) { handleServiceError(err, reply); }
  });

  server.patch('/oc/clients/:clientId/data-mapping-fields/:fieldId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, fieldId } = req.params as { clientId: string; fieldId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.send(await mapping.updateFieldMapping(fieldId, clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.delete('/oc/clients/:clientId/data-mapping-fields/:fieldId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, fieldId } = req.params as { clientId: string; fieldId: string };
    try { await mapping.removeFieldMapping(fieldId, clientId); reply.status(204).send(); } catch (err) { handleServiceError(err, reply); }
  });
}
