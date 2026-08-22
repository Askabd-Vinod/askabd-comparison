/**
 * Requirements Traceability Matrix routes (Phase 3, Part 8) — surfaces the
 * real chains the Traceability Engine (migration 041) has been recording
 * all session (Discovery -> Business Requirement -> Gap -> Recommendation/
 * Transformation -> Generated Document, and more). Staff-only, same
 * Admin.Access precedent as every other opaque-ID capability this session.
 *
 * Deliberately NOT client-scoped in the URL — a traceability chain is
 * entity-to-entity, not inherently tied to one client's path segment
 * (matches the engine's own "generic enough for any two linked entities"
 * design) — same pattern as other opaque-ID single-entity lookups
 * elsewhere in this app (e.g. /oc/business-requirements/:id/...).
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import { TraceabilityEngine, type ChainLink } from '../services/traceability-engine.js';
import { resolveEntityLabel } from '../services/entity-label-resolver.js';

async function enrich(links: ChainLink[]) {
  return Promise.all(links.map(async (l) => ({
    ...l,
    sourceLabel: await resolveEntityLabel(l.sourceType, l.sourceId),
    targetLabel: await resolveEntityLabel(l.targetType, l.targetId),
  })));
}

export async function traceabilityRoutes(server: FastifyInstance): Promise<void> {
  const engine = new TraceabilityEngine();

  server.get('/oc/traceability/:entityType/:entityId', async (req: FastifyRequest) => {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    const query = req.query as { maxDepth?: string };
    const maxDepth = query.maxDepth ? parseInt(query.maxDepth, 10) : undefined;

    const [label, outbound, inbound, forwardChain, backwardChain] = await Promise.all([
      resolveEntityLabel(entityType, entityId),
      engine.getOutboundLinks(entityType, entityId),
      engine.getInboundLinks(entityType, entityId),
      engine.getForwardChain(entityType, entityId, maxDepth),
      engine.getBackwardChain(entityType, entityId, maxDepth),
    ]);

    const [enrichedForward, enrichedBackward] = await Promise.all([enrich(forwardChain), enrich(backwardChain)]);

    return {
      entity: { type: entityType, id: entityId, label },
      outbound,
      inbound,
      forwardChain: enrichedForward,
      backwardChain: enrichedBackward,
    };
  });
}
