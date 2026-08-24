/**
 * Data Reconciliation Engine routes — `data_reconciliation_test_1`
 * (2026-08-24). Staff-only (Admin.Access-gated) — real database
 * credentials are involved (via connection ids), same precedent as every
 * other connector-touching route this session.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DataReconciliationEngine, ReconciliationOwnershipError, InvalidReconciliationInputError } from '../services/data-reconciliation-engine.js';
import { getAuth } from '../middleware/auth.js';

function handleServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ReconciliationOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } }); return; }
  if (err instanceof InvalidReconciliationInputError) { reply.status(400).send({ error: { code: 'invalid_input', message: err.message } }); return; }
  reply.status(400).send({ error: { code: 'reconciliation_error', message: (err as Error).message } });
}

export async function dataReconciliationRoutes(server: FastifyInstance): Promise<void> {
  const reconciliation = new DataReconciliationEngine();

  server.get('/oc/clients/:clientId/reconciliation-runs', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { runs: await reconciliation.listRuns(clientId) };
  });

  server.post('/oc/clients/:clientId/reconciliation-runs', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = (req.body as any) ?? {};
    const actor = getAuth(req)?.userId ?? null;
    try { reply.status(201).send(await reconciliation.runReconciliation(clientId, body, actor)); } catch (err) { handleServiceError(err, reply); }
  });

  server.get('/oc/clients/:clientId/reconciliation-runs/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId, id } = req.params as { clientId: string; id: string };
    try { reply.send(await reconciliation.getRun(id, clientId)); } catch (err) { handleServiceError(err, reply); }
  });
}
