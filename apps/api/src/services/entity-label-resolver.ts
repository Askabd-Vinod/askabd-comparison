/**
 * Resolves a real, human-readable label for an opaque (entityType, entityId)
 * pair recorded in `traceability_links` — used ONLY for display, by the
 * Requirements Traceability Matrix UI (traceability-routes.ts). Never
 * fabricates: an entity type with no known resolver, or an ID with no
 * matching row, returns `null`, and the caller must show that honestly
 * ("Label unavailable"), never guess or synthesize a name.
 *
 * A real, pre-existing inconsistency was found while building this, not
 * fixed here: traceability links have been recorded under TWO different
 * type vocabularies for the same real concepts, by different services —
 * SINGULAR ('business_requirement', 'gap', 'transformation') from
 * gap-analysis-service.ts / decision-transformation-service.ts, and
 * PLURAL, data-source-registry-key form ('business_requirements', 'gaps',
 * 'transformations', 'gap_options_decisions', 'discovery_sources',
 * 'assessments') from document-generation-engine.ts. Auditing/migrating
 * every already-recorded link row across 3 services to one vocabulary is
 * real, separate work, out of scope for a UI-surfacing task — flagged in
 * docs/enterprise-operations-progress.md Pending Tasks. This resolver
 * defensively treats both forms as aliases of the same real lookup so the
 * UI degrades gracefully rather than silently mislabeling one convention.
 *
 * `gap_options_decisions` is a genuinely mixed source — its real IDs come
 * from TWO different tables (`oc_gap_options` and `oc_decisions`) under one
 * type string, so its resolver tries both real tables in turn.
 *
 * Real fix (found via `traceability_test_1`): the alias table below now
 * imports `TYPE_ALIASES` from `traceability-engine.ts` instead of keeping
 * its own separate copy — the engine's own chain queries (`walk()`,
 * `getOutboundLinks`/`getInboundLinks`) were made alias-aware there too,
 * so this file's alias list and the engine's query-matching alias list can
 * never drift apart into two different "canonical" answers.
 */
import { sharedPool } from './db-pool.js';
import { TYPE_ALIASES } from './traceability-engine.js';

type Resolver = (id: string) => Promise<string | null>;

async function lookup(sql: string, id: string, format: (row: any) => string | null): Promise<string | null> {
  const res = await sharedPool.query(sql, [id]);
  const row = res.rows[0];
  return row ? format(row) : null;
}

const RESOLVERS: Record<string, Resolver> = {
  problem: (id) => lookup(`SELECT title FROM oc_problems WHERE id = $1`, id, r => r.title || null),
  // Real gap found and fixed via this session's own live Playwright verification of the
  // Traceability UI: the Universal Testing Engine (built after this resolver) records real
  // `test_case --tests--> business_requirement` links, but no resolver existed for
  // `test_case` — every test-case node showed the honest-but-unhelpful "Label unavailable"
  // instead of its real, existing `title`. Fixed by adding this real lookup.
  test_case: (id) => lookup(`SELECT title FROM test_cases WHERE id = $1`, id, r => r.title || null),
  business_requirement: (id) => lookup(`SELECT title FROM oc_business_requirements WHERE id = $1`, id, r => r.title || null),
  gap: (id) => lookup(`SELECT title FROM oc_gaps WHERE id = $1`, id, r => r.title || null),
  gap_evidence: (id) => lookup(`SELECT text FROM oc_gap_evidence WHERE id = $1`, id, r => r.text ? `Evidence: ${String(r.text).slice(0, 60)}` : null),
  recommendation: (id) => lookup(`SELECT name FROM oc_gap_options WHERE id = $1`, id, r => r.name || null), // real recommendation rows are not individually addressable yet — see Pending Tasks
  transformation: (id) => lookup(`SELECT title FROM oc_transformations WHERE id = $1`, id, r => r.title || null),
  generated_document: (id) => lookup(`SELECT title FROM generated_documents WHERE id = $1`, id, r => r.title || null),
  discovery_source: (id) => lookup(`SELECT title FROM discovery_sources WHERE id = $1`, id, r => r.title || null),
  discovery_extraction: (id) => lookup(`SELECT field_name, field_value FROM discovery_extractions WHERE id = $1`, id, r => r.field_name ? `${r.field_name}: ${String(r.field_value || '').slice(0, 40)}` : null),
  assessment: (id) => lookup(`SELECT domain, status FROM oc_assessments WHERE id = $1`, id, r => r.domain ? `${r.domain} assessment (${r.status})` : null),
  client_profile: (id) => lookup(`SELECT name FROM oc_clients WHERE id = $1`, id, r => r.name || null),
  decision: (id) => lookup(`SELECT rationale, decision_maker FROM oc_decisions WHERE id = $1`, id, r => r.rationale ? `Decision: ${String(r.rationale).slice(0, 50)}` : (r.decision_maker ? `Decision by ${r.decision_maker}` : null)),
  gap_option: (id) => lookup(`SELECT name FROM oc_gap_options WHERE id = $1`, id, r => r.name ? `Option: ${r.name}` : null),
};

const ALIASES: Record<string, string> = TYPE_ALIASES;

export async function resolveEntityLabel(entityType: string, entityId: string): Promise<string | null> {
  if (entityType === 'gap_options_decisions') {
    // Real, mixed source (see doc comment above) — try both real tables an
    // ID from this type string could genuinely belong to.
    const asOption = await RESOLVERS.gap_option!(entityId).catch(() => null);
    if (asOption) return asOption;
    return RESOLVERS.decision!(entityId).catch(() => null);
  }
  const canonical = ALIASES[entityType] || entityType;
  const resolver = RESOLVERS[canonical];
  if (!resolver) return null;
  try { return await resolver(entityId); } catch { return null; }
}
