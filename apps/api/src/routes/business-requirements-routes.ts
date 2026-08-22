/**
 * Business Requirements Intelligence Routes (migration 038,
 * business-requirements-service.ts).
 *
 * Staff routes (`/oc/clients/:clientId/business-requirements`,
 * `/oc/business-requirements/:id`) are client-scoped or opaque-ID, gated
 * Admin.Access in platform/rbac/rules.ts — same established pattern as
 * crm-routes.ts. This is a staff-authored/staff-managed intelligence
 * capability (classifying the CLIENT's stated requirements), not a
 * customer-facing surface, so no customer-portal read path exists yet —
 * matching CRM's "staff-managed only for now" precedent.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BusinessRequirementsService, type RequirementType, type Priority, type RequirementStatus } from '../services/business-requirements-service.js';
import { getAuth } from '../middleware/auth.js';

const REQUIREMENT_TYPES: RequirementType[] = ['business', 'functional', 'non_functional', 'technical', 'integration', 'security', 'compliance', 'data', 'reporting', 'migration', 'performance', 'availability', 'usability'];
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];
const STATUSES: RequirementStatus[] = ['draft', 'active', 'superseded', 'deprecated'];

export async function businessRequirementsRoutes(server: FastifyInstance): Promise<void> {
  const service = new BusinessRequirementsService();

  server.get('/oc/clients/:clientId/business-requirements', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { requirements: await service.listRequirements(clientId) };
  });

  server.get('/oc/clients/:clientId/business-requirements/summary', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { summary: await service.getQualitySummary(clientId) };
  });

  server.post('/oc/clients/:clientId/business-requirements', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as Record<string, unknown>;
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'title is required' } });
    }
    if (body.requirementType && !REQUIREMENT_TYPES.includes(body.requirementType as RequirementType)) {
      return reply.status(400).send({ error: { code: 'invalid_requirement_type', message: `requirementType must be one of ${REQUIREMENT_TYPES.join(', ')}` } });
    }
    if (body.priority && !PRIORITIES.includes(body.priority as Priority)) {
      return reply.status(400).send({ error: { code: 'invalid_priority', message: `priority must be one of ${PRIORITIES.join(', ')}` } });
    }
    const auth = getAuth(req);
    const requirement = await service.createRequirement(clientId, {
      requirementType: body.requirementType as RequirementType | undefined,
      title: (body.title as string).trim(),
      description: body.description as string | undefined,
      source: body.source as string | undefined,
      businessObjective: body.businessObjective as string | undefined,
      stakeholder: body.stakeholder as string | undefined,
      priority: body.priority as Priority | undefined,
      category: body.category as string | undefined,
      acceptanceCriteria: body.acceptanceCriteria as string | undefined,
      dependencies: body.dependencies as string | undefined,
      constraints: body.constraints as string | undefined,
      assumptions: body.assumptions as string | undefined,
      evidence: body.evidence as string | undefined,
      owner: body.owner as string | undefined,
    }, auth?.userId ?? null);
    reply.status(201).send({ requirement });
  });

  server.get('/oc/business-requirements/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const requirement = await service.getRequirement(id);
    if (!requirement) return reply.status(404).send({ error: { code: 'not_found', message: 'Requirement not found' } });
    reply.send({ requirement });
  });

  server.put('/oc/business-requirements/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    if (body.requirementType && !REQUIREMENT_TYPES.includes(body.requirementType as RequirementType)) {
      return reply.status(400).send({ error: { code: 'invalid_requirement_type', message: `requirementType must be one of ${REQUIREMENT_TYPES.join(', ')}` } });
    }
    if (body.priority && !PRIORITIES.includes(body.priority as Priority)) {
      return reply.status(400).send({ error: { code: 'invalid_priority', message: `priority must be one of ${PRIORITIES.join(', ')}` } });
    }
    if (body.status && !STATUSES.includes(body.status as RequirementStatus)) {
      return reply.status(400).send({ error: { code: 'invalid_status', message: `status must be one of ${STATUSES.join(', ')}` } });
    }
    const auth = getAuth(req);
    const requirement = await service.updateRequirement(id, body as any, auth?.userId ?? null);
    if (!requirement) return reply.status(404).send({ error: { code: 'not_found', message: 'Requirement not found' } });
    reply.send({ requirement });
  });

  server.post('/oc/business-requirements/:id/deprecate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const requirement = await service.deprecateRequirement(id, auth?.userId ?? null);
    if (!requirement) return reply.status(404).send({ error: { code: 'not_found', message: 'Requirement not found' } });
    reply.send({ requirement });
  });

  server.post('/oc/business-requirements/:id/flag-conflict', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { conflictsWithId?: string };
    if (!body.conflictsWithId || !body.conflictsWithId.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'conflictsWithId is required' } });
    }
    const auth = getAuth(req);
    const requirement = await service.flagConflict(id, body.conflictsWithId.trim(), auth?.userId ?? null);
    if (!requirement) return reply.status(404).send({ error: { code: 'not_found', message: 'Requirement or conflictsWithId not found' } });
    reply.send({ requirement });
  });

  server.get('/oc/business-requirements/:id/history', async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    return { history: await service.getHistory(id) };
  });
}
