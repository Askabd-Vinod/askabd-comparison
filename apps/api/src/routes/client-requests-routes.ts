/**
 * Client Requests Routes — real customer self-service (Part 1/2/6/14, 2026-08-20
 * master UAT pass). See client-request-service.ts / migration 033.
 *
 * Same split as crm-routes.ts: staff management (`/oc/clients/:clientId/requests*`,
 * Admin.Access-gated in platform/rbac/rules.ts) vs. the customer-portal path
 * (`/oc/portal/:clientId/requests`, unlisted — falls to defaultPolicy
 * 'authenticated' + tenant-access.ts's real membership check, matching every
 * other /oc/portal/:clientId/* route).
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ClientRequestService, type RequestStatus, type RequestType } from '../services/client-request-service.js';
import { getAuth } from '../middleware/auth.js';

const VALID_TYPES: RequestType[] = ['service', 'connector', 'support', 'requirement', 'incident', 'change'];
const VALID_STATUSES: RequestStatus[] = ['requested', 'under_review', 'approved', 'rejected', 'in_progress', 'completed'];

export async function clientRequestsRoutes(server: FastifyInstance): Promise<void> {
  const service = new ClientRequestService();

  // ─── Staff management ────────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/requests', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    const q = req.query as { status?: string; requestType?: string };
    const status = VALID_STATUSES.includes(q.status as RequestStatus) ? (q.status as RequestStatus) : undefined;
    const requestType = VALID_TYPES.includes(q.requestType as RequestType) ? (q.requestType as RequestType) : undefined;
    return { requests: await service.listForClient(clientId, { status, requestType }) };
  });

  server.post('/oc/client-requests/:id/transition', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status?: string; resolutionNotes?: string; assignedTo?: string };
    if (!body.status || !VALID_STATUSES.includes(body.status as RequestStatus)) {
      return reply.status(400).send({ error: { code: 'invalid_status', message: `status must be one of ${VALID_STATUSES.join(', ')}` } });
    }
    const auth = getAuth(req);
    const result = await service.transition(id, body.status as RequestStatus, auth?.userId ?? 'unknown-staff', { resolutionNotes: body.resolutionNotes, assignedTo: body.assignedTo });
    if (!result.ok) {
      const status = result.error.code === 'not_found' ? 404 : 409;
      return reply.status(status).send({ error: result.error });
    }
    reply.send({ request: result.value });
  });

  // ─── Customer-portal path ────────────────────────────────────────────────
  server.get('/oc/portal/:clientId/requests', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { requests: await service.listForCustomer(clientId) };
  });

  server.post('/oc/portal/:clientId/requests', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { requestType?: string; targetKey?: string; targetLabel?: string; description?: string; priority?: string };
    if (!body.requestType || !VALID_TYPES.includes(body.requestType as RequestType)) {
      return reply.status(400).send({ error: { code: 'invalid_request_type', message: `requestType must be one of ${VALID_TYPES.join(', ')}` } });
    }
    const auth = getAuth(req);
    if (!auth?.userId || !auth?.tenantId) {
      return reply.status(401).send({ error: { code: 'not_authenticated', message: 'Sign in to submit a request.' } });
    }
    const result = await service.create({
      clientId, requestType: body.requestType as RequestType, targetKey: body.targetKey, targetLabel: body.targetLabel,
      description: body.description ?? '', requestedBy: auth.userId, requestedByOrgContext: auth.tenantId,
      priority: (body.priority as any) || 'normal',
    });
    if (!result.ok) {
      const status = result.error.code === 'client_not_found' ? 404 : result.error.code === 'already_active' ? 409 : 400;
      return reply.status(status).send({ error: result.error });
    }
    reply.status(201).send({ request: result.value });
  });
}
