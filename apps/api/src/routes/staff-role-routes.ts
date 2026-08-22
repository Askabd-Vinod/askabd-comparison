/**
 * Staff Role Management Routes — admin-only grant/revoke/list of AskABD staff roles.
 * See services/staff-role-service.ts and migration 026_staff_role_assignment.sql for
 * the full rationale (the real, DB-backed source of roles, since real askabd-identity
 * tokens carry no roles claim).
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StaffRoleService } from '../services/staff-role-service.js';
import { getAuth } from '../middleware/auth.js';

const VALID_ROLES = ['customer', 'business_user', 'admin', 'super_admin', 'merchant', 'partner', 'support', 'auditor'] as const;

export async function staffRoleRoutes(server: FastifyInstance): Promise<void> {
  const staffRoleService = new StaffRoleService();

  // RBAC (see platform/rbac/rules.ts) normally gates this to Admin.Access. The one
  // exception, handled here rather than in RBAC rules (which have no concept of "is
  // the table empty"): a genuinely fresh deployment has NO staff_role_assignment rows
  // at all, so no real token could ever satisfy Admin.Access to grant the very first
  // one — a real bootstrap problem, not a hypothetical. Resolved narrowly: if zero
  // assignments exist anywhere AND the request is granting a role to the CALLER's OWN
  // real, verified identity (never someone else's), it is allowed once. The instant
  // any row exists, this path is permanently closed — a customer cannot exploit this
  // to self-grant admin except in the literal single instant before any admin exists
  // on a fresh system, which is already a real deployment/seeding decision.
  server.post('/oc/staff/roles', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { identityId?: string; role?: string };
    if (!body.identityId || !body.role) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'identityId and role are required' } });
    }
    if (!VALID_ROLES.includes(body.role as any)) {
      return reply.status(400).send({ error: { code: 'invalid_role', message: `role must be one of: ${VALID_ROLES.join(', ')}` } });
    }
    const auth = getAuth(req);

    const existing = await staffRoleService.listAll();
    const isBootstrap = existing.length === 0 && auth?.userId === body.identityId;
    const isAdmin = (req as any).authorization?.roles?.includes('admin') || (req as any).authorization?.roles?.includes('super_admin');
    if (!isBootstrap && !isAdmin) {
      return reply.status(403).send({
        error: { category: 'authorization', code: 'SHARED.AUTHORIZATION_ERROR', reasonCode: 'forbidden', message: 'You do not have permission to perform this action.', statusCode: 403 },
      });
    }

    const result = await staffRoleService.grantRole({ identityId: body.identityId, role: body.role, grantedBy: auth?.userId ?? null });
    if (!result.ok) {
      return reply.status(400).send({ error: result.error });
    }
    reply.status(201).send({ assignment: result.value, bootstrap: isBootstrap });
  });

  server.get('/oc/staff/roles', async () => {
    const assignments = await staffRoleService.listAll();
    return { assignments };
  });

  server.get('/oc/staff/roles/:identityId', async (req: FastifyRequest) => {
    const { identityId } = req.params as { identityId: string };
    const assignments = await staffRoleService.listForIdentity(identityId);
    return { assignments };
  });

  server.post('/oc/staff/roles/:identityId/:role/revoke', async (req: FastifyRequest, reply: FastifyReply) => {
    const { identityId, role } = req.params as { identityId: string; role: string };
    const auth = getAuth(req);
    const result = await staffRoleService.revokeRole({ identityId, role, revokedBy: auth?.userId ?? null });
    if (!result.ok) {
      return reply.status(404).send({ error: result.error });
    }
    reply.send(result.value);
  });
}
