/**
 * Client Database Connections Routes — real, multi-record connection
 * management (2026-08-21). See client-database-connection-service.ts /
 * migration 034.
 *
 * Staff-only, Admin.Access-gated (registered in platform/rbac/rules.ts) —
 * matches every other client-scoped management route group in this app.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ClientDatabaseConnectionService, type ConnectorType } from '../services/client-database-connection-service.js';
import { getAuth } from '../middleware/auth.js';

const VALID_TYPES: ConnectorType[] = ['postgresql', 'oracle', 'sqlserver', 'mysql', 'mongodb', 'other'];

export async function clientDatabaseConnectionsRoutes(server: FastifyInstance): Promise<void> {
  const service = new ClientDatabaseConnectionService();

  server.get('/oc/clients/:clientId/database-connections', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { connections: await service.list(clientId) };
  });

  server.post('/oc/clients/:clientId/database-connections', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as {
      name?: string; connectorType?: string; host?: string; port?: number | string; databaseName?: string;
      username?: string; password?: string; authType?: string; environment?: string; description?: string; tags?: string[];
    };
    const connectorType = VALID_TYPES.includes(body.connectorType as ConnectorType) ? (body.connectorType as ConnectorType) : 'other';
    const auth = getAuth(req);
    const result = await service.create({
      clientId, name: body.name || '', connectorType, host: body.host || '',
      port: typeof body.port === 'string' ? parseInt(body.port, 10) : (body.port || 0),
      databaseName: body.databaseName || '', username: body.username || '', password: body.password,
      authType: body.authType, environment: body.environment, description: body.description, tags: body.tags,
      createdBy: auth?.userId || 'unknown-staff',
    });
    if (!result.ok) return reply.status(400).send({ error: result.error });
    reply.status(201).send({ connection: result.value });
  });

  server.patch('/oc/database-connections/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string; connectorType?: string; host?: string; port?: number | string; databaseName?: string;
      username?: string; password?: string; authType?: string; environment?: string; description?: string; tags?: string[];
    };
    const auth = getAuth(req);
    const result = await service.update(id, {
      name: body.name, connectorType: body.connectorType ? (VALID_TYPES.includes(body.connectorType as ConnectorType) ? (body.connectorType as ConnectorType) : undefined) : undefined,
      host: body.host, port: body.port !== undefined ? (typeof body.port === 'string' ? parseInt(body.port, 10) : body.port) : undefined,
      databaseName: body.databaseName, username: body.username, password: body.password,
      authType: body.authType, environment: body.environment, description: body.description, tags: body.tags,
    }, auth?.userId || 'unknown-staff');
    if (!result.ok) return reply.status(result.error.code === 'not_found' ? 404 : 400).send({ error: result.error });
    reply.send({ connection: result.value });
  });

  server.delete('/oc/database-connections/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const result = await service.remove(id, auth?.userId || 'unknown-staff');
    if (!result.ok) return reply.status(404).send({ error: result.error });
    reply.send({ removed: true, id: result.value.id });
  });

  server.post('/oc/database-connections/:id/test', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = await service.test(id);
    if (!result.ok) return reply.status(404).send({ error: result.error });
    reply.send({ connection: result.value });
  });
}
