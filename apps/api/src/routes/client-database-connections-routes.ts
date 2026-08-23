/**
 * Client Database Connections Routes — real, multi-record connection
 * management (2026-08-21). See client-database-connection-service.ts /
 * migration 034.
 *
 * Staff-only, Admin.Access-gated (registered in platform/rbac/rules.ts) —
 * matches every other client-scoped management route group in this app.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ClientDatabaseConnectionService, DatabaseConnectionOwnershipError, type ConnectorType, type SslMode } from '../services/client-database-connection-service.js';
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
      sslMode?: string; sslCaCertificate?: string;
    };
    const connectorType = VALID_TYPES.includes(body.connectorType as ConnectorType) ? (body.connectorType as ConnectorType) : 'other';
    const auth = getAuth(req);
    const result = await service.create({
      clientId, name: body.name || '', connectorType, host: body.host || '',
      port: typeof body.port === 'string' ? parseInt(body.port, 10) : (body.port || 0),
      databaseName: body.databaseName || '', username: body.username || '', password: body.password,
      authType: body.authType, environment: body.environment, description: body.description, tags: body.tags,
      createdBy: auth?.userId || 'unknown-staff',
      sslMode: body.sslMode as SslMode | undefined, sslCaCertificate: body.sslCaCertificate,
    });
    if (!result.ok) return reply.status(400).send({ error: result.error });
    reply.status(201).send({ connection: result.value });
  });

  // SECURITY FIX (connector_test_1, 2026-08-24): these 3 routes carry no
  // :clientId URL segment, so tenant-access.ts never applied to them at
  // all — real object-level-authorization gap, see
  // DatabaseConnectionOwnershipError's own doc comment in the service for
  // the full real impact. clientId is now required (body for PATCH,
  // matching its existing JSON body; query for DELETE/test, matching the
  // established `/oc/connectors/:id?clientId=` convention) and enforced;
  // a mismatch or a missing clientId returns the same 404 as "doesn't
  // exist" — never distinguishing the two.
  server.patch('/oc/database-connections/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      clientId?: string;
      name?: string; connectorType?: string; host?: string; port?: number | string; databaseName?: string;
      username?: string; password?: string; authType?: string; environment?: string; description?: string; tags?: string[];
      sslMode?: string; sslCaCertificate?: string;
    };
    if (!body.clientId) { reply.status(404).send({ error: { code: 'not_found', message: 'No such connection.' } }); return; }
    const auth = getAuth(req);
    try {
      const result = await service.update(id, body.clientId, {
        name: body.name, connectorType: body.connectorType ? (VALID_TYPES.includes(body.connectorType as ConnectorType) ? (body.connectorType as ConnectorType) : undefined) : undefined,
        host: body.host, port: body.port !== undefined ? (typeof body.port === 'string' ? parseInt(body.port, 10) : body.port) : undefined,
        databaseName: body.databaseName, username: body.username, password: body.password,
        authType: body.authType, environment: body.environment, description: body.description, tags: body.tags,
        sslMode: body.sslMode as SslMode | undefined, sslCaCertificate: body.sslCaCertificate,
      }, auth?.userId || 'unknown-staff');
      if (!result.ok) return reply.status(result.error.code === 'not_found' ? 404 : 400).send({ error: result.error });
      reply.send({ connection: result.value });
    } catch (err) {
      if (err instanceof DatabaseConnectionOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'No such connection.' } }); return; }
      throw err;
    }
  });

  server.delete('/oc/database-connections/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { clientId } = req.query as { clientId?: string };
    if (!clientId) { reply.status(404).send({ error: { code: 'not_found', message: 'No such connection.' } }); return; }
    const auth = getAuth(req);
    try {
      const result = await service.remove(id, clientId, auth?.userId || 'unknown-staff');
      if (!result.ok) return reply.status(404).send({ error: result.error });
      reply.send({ removed: true, id: result.value.id });
    } catch (err) {
      if (err instanceof DatabaseConnectionOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'No such connection.' } }); return; }
      throw err;
    }
  });

  server.post('/oc/database-connections/:id/test', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { clientId } = req.query as { clientId?: string };
    if (!clientId) { reply.status(404).send({ error: { code: 'not_found', message: 'No such connection.' } }); return; }
    let result;
    try {
      result = await service.test(id, clientId);
    } catch (err) {
      if (err instanceof DatabaseConnectionOwnershipError) { reply.status(404).send({ error: { code: 'not_found', message: 'No such connection.' } }); return; }
      throw err;
    }
    if (!result.ok) return reply.status(404).send({ error: result.error });
    reply.send({ connection: result.value });
  });
}
