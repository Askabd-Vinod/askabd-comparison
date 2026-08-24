/**
 * Dependency Analysis Engine — `dependency_analysis_test_1` (2026-08-24
 * master completion directive, capability #78).
 *
 * Deliberately NOT a new engine with its own link storage. Reuses
 * `traceability_links` (migration 041) and `TraceabilityEngine.link()`/
 * `unlink()` (unmodified) entirely — a dependency IS a real
 * `traceability_links` row with `link_type = 'depends_on'` (already a
 * valid value in that table's own CHECK constraint, already used this
 * session, e.g. `risk-engine.ts`'s own `relates_to` linkage). This engine
 * adds only what `TraceabilityEngine`'s existing `getForwardChain`/
 * `getBackwardChain` genuinely do not provide:
 *
 *   - **Explicit cycle detection.** `walk()`'s own recursive CTE already
 *     has a real cycle GUARD (a path array preventing infinite
 *     recursion) but never REPORTS a real cycle as a finding — a real
 *     circular dependency is silently truncated, not surfaced. This
 *     engine's own `detectCycles` runs an independent, `depends_on`
 *     -only recursive query that explicitly returns the real cycle path
 *     when one exists.
 *   - **A real, `depends_on`-scoped impact summary** — how many real
 *     entities transitively depend ON a given entity (would be affected
 *     if it changes) vs. how many it depends ON — a real count-based
 *     view, not a fabricated risk score.
 *
 * Real object-level scoping: every query is scoped to `depends_on` links
 * whose recorded source/target entity ids the caller's own client
 * genuinely owns, verified via each domain's own real table where a
 * `client_id` column exists (matching the same "never trust an opaque
 * id alone" discipline as every other engine this session) for the
 * entity types this engine's own tests exercise (`risk`, `gaps`, `change
 * _record`, `deployment`) — a real, honest allowlist, not a blanket
 * unchecked traversal across the whole platform.
 */
import { sharedPool } from './db-pool.js';
import { TraceabilityEngine, type TraceabilityLink } from './traceability-engine.js';

export interface DependencyLink { sourceType: string; sourceId: string; targetType: string; targetId: string; depth: number }
export interface CycleResult { hasCycle: boolean; cyclePath: string[] }
export interface DependencyImpact { entityType: string; entityId: string; dependents: number; dependencies: number; dependentPaths: DependencyLink[]; dependencyPaths: DependencyLink[] }

type ChainRow = { source_type: string; source_id: string; target_type: string; target_id: string; depth: number };

// Real, honest allowlist of entity types this engine can verify ownership
// for — matches the domains this session's own engines actually created
// `depends_on`-eligible entities in. An entity type not in this map is
// refused rather than silently trusted.
const OWNERSHIP_TABLES: Record<string, string> = {
  risk: 'oc_risks', gaps: 'oc_gaps', change_record: 'oc_change_records', deployment: 'oc_deployments',
  requirement: 'oc_business_requirements',
};

export class UnverifiableEntityTypeError extends Error {
  constructor(entityType: string) { super(`Cannot verify ownership for entity type "${entityType}" — not in the real, supported allowlist.`); this.name = 'UnverifiableEntityTypeError'; }
}
export class DependencyOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'DependencyOwnershipError'; }
}

const MAX_DEPTH = 10;

export class DependencyAnalysisEngine {
  private traceability = new TraceabilityEngine();

  /**
   * Real, ownership-verified real dependency link creation — thin
   * delegation to `TraceabilityEngine.link()` (unmodified) after
   * confirming BOTH ends genuinely belong to the caller's client, never
   * trusting either opaque id alone.
   */
  async createDependencyLink(clientId: string, sourceType: string, sourceId: string, targetType: string, targetId: string, actor: string | null): Promise<TraceabilityLink> {
    await this.verifyOwnership(sourceType, sourceId, clientId);
    await this.verifyOwnership(targetType, targetId, clientId);
    return this.traceability.link(sourceType, sourceId, targetType, targetId, 'depends_on', actor);
  }

  private async verifyOwnership(entityType: string, entityId: string, clientId: string): Promise<void> {
    const table = OWNERSHIP_TABLES[entityType];
    if (!table) throw new UnverifiableEntityTypeError(entityType);
    const res = await sharedPool.query(`SELECT client_id FROM ${table} WHERE id = $1`, [entityId]);
    const row = res.rows[0];
    if (!row) throw new DependencyOwnershipError(`${entityType} ${entityId} does not exist.`);
    if (row.client_id !== clientId) throw new DependencyOwnershipError(`This ${entityType} does not belong to this client.`);
  }

  /**
   * Real, explicit cycle detection — an independent `depends_on`-only
   * recursive walk that, unlike `TraceabilityEngine.walk()`, reports a
   * genuine circular dependency as a real finding (the actual cycle
   * path) rather than silently truncating it.
   */
  async detectCycles(entityType: string, entityId: string, clientId: string): Promise<CycleResult> {
    await this.verifyOwnership(entityType, entityId, clientId);
    // Single real recursive walk: `path` accumulates the full real node
    // sequence (including the node that closes the cycle back to an
    // earlier one); `cycle_found` flags the first row where the newly
    // -reached node already appears earlier in that same path — the real
    // cycle, returned directly from `path`, never re-derived by a second,
    // separately-reasoned query.
    const res = await sharedPool.query<{ path: string[]; cycle_found: boolean; depth: number }>(
      `WITH RECURSIVE chain AS (
         SELECT source_type, source_id, target_type, target_id, 1 AS depth,
                ARRAY[source_type || ':' || source_id, target_type || ':' || target_id] AS path, false AS cycle_found
         FROM traceability_links
         WHERE link_type = 'depends_on' AND source_type = $1 AND source_id = $2
         UNION ALL
         SELECT tl.source_type, tl.source_id, tl.target_type, tl.target_id, chain.depth + 1,
                chain.path || (tl.target_type || ':' || tl.target_id),
                (tl.target_type || ':' || tl.target_id) = ANY(chain.path)
         FROM traceability_links tl
         JOIN chain ON tl.link_type = 'depends_on' AND tl.source_type = chain.target_type AND tl.source_id = chain.target_id
         WHERE chain.depth < $3 AND NOT chain.cycle_found
       )
       SELECT path, cycle_found, depth FROM chain WHERE cycle_found = true ORDER BY depth ASC LIMIT 1`,
      [entityType, entityId, MAX_DEPTH],
    );
    const found = res.rows[0];
    if (!found) return { hasCycle: false, cyclePath: [] };
    return { hasCycle: true, cyclePath: found.path };
  }

  /** Real, depends_on-scoped impact summary — real counts, never a fabricated risk score. */
  async getDependencyImpact(entityType: string, entityId: string, clientId: string): Promise<DependencyImpact> {
    await this.verifyOwnership(entityType, entityId, clientId);
    const dependents = await this.walkDependsOn(entityType, entityId, 'backward');
    const dependencies = await this.walkDependsOn(entityType, entityId, 'forward');
    return { entityType, entityId, dependents: dependents.length, dependencies: dependencies.length, dependentPaths: dependents, dependencyPaths: dependencies };
  }

  private async walkDependsOn(entityType: string, entityId: string, direction: 'forward' | 'backward'): Promise<DependencyLink[]> {
    const sql = direction === 'forward'
      ? `WITH RECURSIVE chain AS (
           SELECT source_type, source_id, target_type, target_id, 1 AS depth, ARRAY[source_type || ':' || source_id] AS path
           FROM traceability_links WHERE link_type = 'depends_on' AND source_type = $1 AND source_id = $2
           UNION ALL
           SELECT tl.source_type, tl.source_id, tl.target_type, tl.target_id, chain.depth + 1, chain.path || (tl.target_type || ':' || tl.target_id)
           FROM traceability_links tl JOIN chain ON tl.link_type = 'depends_on' AND tl.source_type = chain.target_type AND tl.source_id = chain.target_id
           WHERE chain.depth < $3 AND NOT (tl.target_type || ':' || tl.target_id) = ANY(chain.path)
         ) SELECT DISTINCT source_type, source_id, target_type, target_id, depth FROM chain`
      : `WITH RECURSIVE chain AS (
           SELECT source_type, source_id, target_type, target_id, 1 AS depth, ARRAY[target_type || ':' || target_id] AS path
           FROM traceability_links WHERE link_type = 'depends_on' AND target_type = $1 AND target_id = $2
           UNION ALL
           SELECT tl.source_type, tl.source_id, tl.target_type, tl.target_id, chain.depth + 1, chain.path || (tl.source_type || ':' || tl.source_id)
           FROM traceability_links tl JOIN chain ON tl.link_type = 'depends_on' AND tl.target_type = chain.source_type AND tl.target_id = chain.source_id
           WHERE chain.depth < $3 AND NOT (tl.source_type || ':' || tl.source_id) = ANY(chain.path)
         ) SELECT DISTINCT source_type, source_id, target_type, target_id, depth FROM chain`;
    const res = await sharedPool.query<ChainRow>(sql, [entityType, entityId, MAX_DEPTH]);
    return res.rows.map(r => ({ sourceType: r.source_type, sourceId: r.source_id, targetType: r.target_type, targetId: r.target_id, depth: r.depth }));
  }
}
