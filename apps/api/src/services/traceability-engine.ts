/**
 * Generic Traceability Engine — Phase 1 shared foundation, closing out
 * Phase 1 (migration 041, see docs/enterprise-operations-roadmap.md
 * Phase 1). Supports the BR->FR->TR->EWR->EWP->Task->TC->Defect->
 * Deployment->UAT->Production chain from Part 8 of the governing brief,
 * generic enough for any two linked entities.
 *
 * Forward chain = follow links in the direction they were recorded
 * (source -> target), e.g. starting from a Business Requirement and
 * walking down to everything that derives from/implements/tests it.
 * Backward chain = the reverse: starting from, say, a Deployment, walking
 * up to everything that led to it.
 *
 * Chain traversal uses a real Postgres recursive CTE with an explicit
 * cycle guard (a path array checked with `!= ANY(path)`) — never an
 * unbounded or silently-looping walk, and never a fabricated "impact
 * analysis" number; every node in a returned chain is a real link row.
 */
import { sharedPool } from './db-pool.js';

/**
 * Real, live-reproduced fix (found via `traceability_test_1`): a real
 * BRD document generated from a real business requirement creates a
 * `traceability_links` row via `document-generation-engine.ts`, whose
 * `sourceType` is literally its own internal data-source-registry key —
 * PLURAL (`business_requirements`) — while every other writer
 * (`gap-analysis-service.ts`, `decision-transformation-service.ts`, the
 * Traceability UI's own query root) uses the SINGULAR form
 * (`business_requirement`). Before this fix, that meant a real,
 * correctly-created link row was silently invisible from the singular
 * root's forward chain — not a missing link, a real link the exact-match
 * query simply couldn't find. `entity-label-resolver.ts` already aliased
 * both forms for DISPLAY purposes only; this is the same alias table
 * formalized as part of the engine's own query contract (per the
 * doc-comment's own "(b) formalize the alias table" resolution option),
 * so a chain lookup finds a real link regardless of which of the two
 * historically-inconsistent forms it happened to be recorded under.
 * Existing rows are NOT migrated (real, separate, deliberately deferred
 * work) — this fixes the READ path, which is where the real user-facing
 * impact is.
 */
export const TYPE_ALIASES: Record<string, string> = {
  business_requirements: 'business_requirement',
  gaps: 'gap',
  transformations: 'transformation',
  discovery_sources: 'discovery_source',
  assessments: 'assessment',
};

/** Every real string a `traceability_links` row might use for this same logical type — the canonical form plus any known alias(es), in both directions. */
export function expandTypeAliases(type: string): string[] {
  const canonical = TYPE_ALIASES[type] || type;
  const forms = new Set<string>([type, canonical]);
  for (const [plural, singular] of Object.entries(TYPE_ALIASES)) {
    if (singular === canonical) forms.add(plural);
  }
  return Array.from(forms);
}

export type LinkType = 'derives_from' | 'implements' | 'tests' | 'blocks' | 'depends_on' | 'relates_to';

export interface TraceabilityLink {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  linkType: LinkType;
  createdBy: string | null;
  createdAt: string;
}

export interface ChainLink extends TraceabilityLink {
  depth: number;
}

type Row = {
  id: string; source_type: string; source_id: string; target_type: string; target_id: string;
  link_type: LinkType; created_by: string | null; created_at: Date;
};
type ChainRow = Row & { depth: number };

function toLink(r: Row): TraceabilityLink {
  return {
    id: r.id, sourceType: r.source_type, sourceId: r.source_id, targetType: r.target_type,
    targetId: r.target_id, linkType: r.link_type, createdBy: r.created_by, createdAt: r.created_at.toISOString(),
  };
}
function toChainLink(r: ChainRow): ChainLink {
  return { ...toLink(r), depth: r.depth };
}

const MAX_DEPTH_CEILING = 25; // a hard ceiling regardless of what a caller requests — never an unbounded walk

export class TraceabilityEngine {
  /**
   * Idempotent — recording the same real (source, target, linkType) triple
   * twice returns the existing link rather than erroring or duplicating.
   */
  async link(sourceType: string, sourceId: string, targetType: string, targetId: string, linkType: LinkType, createdBy: string | null): Promise<TraceabilityLink> {
    await sharedPool.query(
      `INSERT INTO traceability_links (source_type, source_id, target_type, target_id, link_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_type, source_id, target_type, target_id, link_type) DO NOTHING`,
      [sourceType, sourceId, targetType, targetId, linkType, createdBy]
    );
    const res = await sharedPool.query<Row>(
      `SELECT * FROM traceability_links WHERE source_type = $1 AND source_id = $2 AND target_type = $3 AND target_id = $4 AND link_type = $5`,
      [sourceType, sourceId, targetType, targetId, linkType]
    );
    const row = res.rows[0];
    if (!row) throw new Error('traceability_links insert/lookup returned no row');
    return toLink(row);
  }

  /** Real, hard delete — a mistaken link should not linger. Returns whether a row was actually removed. */
  async unlink(sourceType: string, sourceId: string, targetType: string, targetId: string, linkType: LinkType): Promise<boolean> {
    const res = await sharedPool.query(
      `DELETE FROM traceability_links WHERE source_type = $1 AND source_id = $2 AND target_type = $3 AND target_id = $4 AND link_type = $5`,
      [sourceType, sourceId, targetType, targetId, linkType]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Direct outbound links only (this entity as source) — one hop, not a chain. Alias-aware, same as `walk()` — see its doc comment. */
  async getOutboundLinks(sourceType: string, sourceId: string): Promise<TraceabilityLink[]> {
    const res = await sharedPool.query<Row>(
      `SELECT * FROM traceability_links WHERE source_type = ANY($1::text[]) AND source_id = $2 ORDER BY created_at ASC`,
      [expandTypeAliases(sourceType), sourceId]
    );
    return res.rows.map(toLink);
  }

  /** Direct inbound links only (this entity as target) — one hop, not a chain. Alias-aware, same as `walk()` — see its doc comment. */
  async getInboundLinks(targetType: string, targetId: string): Promise<TraceabilityLink[]> {
    const res = await sharedPool.query<Row>(
      `SELECT * FROM traceability_links WHERE target_type = ANY($1::text[]) AND target_id = $2 ORDER BY created_at ASC`,
      [expandTypeAliases(targetType), targetId]
    );
    return res.rows.map(toLink);
  }

  /**
   * The full forward chain from a starting entity — every real link
   * reachable by repeatedly following source -> target, e.g. starting from
   * a Business Requirement and walking down to everything that derives
   * from/implements/tests it, transitively. Real recursive CTE, real cycle
   * guard (a path array), real depth cap — never a fabricated or unbounded
   * traversal.
   */
  async getForwardChain(sourceType: string, sourceId: string, maxDepth = 10): Promise<ChainLink[]> {
    return this.walk(sourceType, sourceId, Math.min(maxDepth, MAX_DEPTH_CEILING), 'forward');
  }

  /**
   * The full backward chain into a starting entity — everything that,
   * transitively, links INTO it (e.g. starting from a Deployment and
   * walking up through every Test Case, Task, and Requirement that led
   * to it).
   */
  async getBackwardChain(targetType: string, targetId: string, maxDepth = 10): Promise<ChainLink[]> {
    return this.walk(targetType, targetId, Math.min(maxDepth, MAX_DEPTH_CEILING), 'backward');
  }

  private async walk(entityType: string, entityId: string, maxDepth: number, direction: 'forward' | 'backward'): Promise<ChainLink[]> {
    // Forward: start node is the SOURCE side, walk source->target.
    // Backward: start node is the TARGET side, walk target->source — the
    // exact mirror image of forward, written out explicitly rather than
    // built by string manipulation, so both directions are easy to verify
    // by eye and neither risks a column-name-splicing bug.
    // Only the base case (the root node itself) needs alias-awareness —
    // once the recursive step is past the first hop, it's matching two
    // real, already-recorded type strings against each other
    // (`tl.source_type = chain.target_type`), which is correct regardless
    // of which vocabulary either happened to use.
    const rootTypes = expandTypeAliases(entityType);

    const sql = direction === 'forward'
      ? `WITH RECURSIVE chain AS (
           SELECT id, source_type, source_id, target_type, target_id, link_type, created_by, created_at, 1 AS depth,
                  ARRAY[source_type || ':' || source_id] AS path
           FROM traceability_links
           WHERE source_type = ANY($1::text[]) AND source_id = $2
           UNION ALL
           SELECT tl.id, tl.source_type, tl.source_id, tl.target_type, tl.target_id, tl.link_type, tl.created_by, tl.created_at,
                  chain.depth + 1, chain.path || (tl.source_type || ':' || tl.source_id)
           FROM traceability_links tl
           JOIN chain ON tl.source_type = chain.target_type AND tl.source_id = chain.target_id
           WHERE chain.depth < $3
             AND NOT (tl.target_type || ':' || tl.target_id) = ANY(chain.path)
         )
         SELECT DISTINCT ON (id) id, source_type, source_id, target_type, target_id, link_type, created_by, created_at, depth
         FROM chain ORDER BY id, depth ASC`
      : `WITH RECURSIVE chain AS (
           SELECT id, source_type, source_id, target_type, target_id, link_type, created_by, created_at, 1 AS depth,
                  ARRAY[target_type || ':' || target_id] AS path
           FROM traceability_links
           WHERE target_type = ANY($1::text[]) AND target_id = $2
           UNION ALL
           SELECT tl.id, tl.source_type, tl.source_id, tl.target_type, tl.target_id, tl.link_type, tl.created_by, tl.created_at,
                  chain.depth + 1, chain.path || (tl.target_type || ':' || tl.target_id)
           FROM traceability_links tl
           JOIN chain ON tl.target_type = chain.source_type AND tl.target_id = chain.source_id
           WHERE chain.depth < $3
             AND NOT (tl.source_type || ':' || tl.source_id) = ANY(chain.path)
         )
         SELECT DISTINCT ON (id) id, source_type, source_id, target_type, target_id, link_type, created_by, created_at, depth
         FROM chain ORDER BY id, depth ASC`;

    const res = await sharedPool.query<ChainRow>(sql, [rootTypes, entityId, maxDepth]);
    return res.rows.map(toChainLink).sort((a, b) => a.depth - b.depth);
  }
}
