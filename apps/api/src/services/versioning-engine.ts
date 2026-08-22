/**
 * Generic Versioning Engine — Phase 1 shared foundation (migration 039,
 * see docs/enterprise-operations-roadmap.md Phase 1).
 *
 * A reusable, entity-agnostic version-history mechanism for any table that
 * needs it going forward, so Phases 2-7 reach for this instead of each
 * hand-rolling its own `<entity>_history` table. Existing per-entity
 * history tables (oc_client_service_requirement_history,
 * oc_business_requirement_history, ...) are real, working, and NOT
 * retrofitted onto this — that would be an unnecessary, risky rewrite of
 * functioning code. This engine is for new work.
 *
 * Concurrency: version-number assignment is serialized per (entityType,
 * entityId) via a transaction-scoped Postgres advisory lock
 * (`pg_advisory_xact_lock`), so two concurrent `recordVersion` calls for the
 * same entity can never race to compute the same next version number — the
 * second caller blocks until the first's transaction commits, then reads
 * the now-updated max. The `UNIQUE (entity_type, entity_id, version)`
 * constraint in migration 039 is the DB-enforced backstop.
 */
import { sharedPool } from './db-pool.js';

export interface EntityVersion {
  id: string;
  entityType: string;
  entityId: string;
  version: number;
  fieldSnapshot: Record<string, unknown>;
  changedBy: string | null;
  changeReason: string | null;
  createdAt: string;
}

type Row = {
  id: string; entity_type: string; entity_id: string; version: number;
  field_snapshot: Record<string, unknown>; changed_by: string | null;
  change_reason: string | null; created_at: Date;
};

function toVersion(r: Row): EntityVersion {
  return {
    id: r.id, entityType: r.entity_type, entityId: r.entity_id, version: r.version,
    fieldSnapshot: r.field_snapshot, changedBy: r.changed_by, changeReason: r.change_reason,
    createdAt: r.created_at.toISOString(),
  };
}

// Postgres advisory locks take a bigint key — hash the (entityType, entityId)
// pair into one via hashtextextended (built into Postgres, no extension
// needed), computed server-side so this stays a pure SQL expression rather
// than a client-side hash that could drift from Postgres's own.
const LOCK_KEY_EXPR = `hashtextextended($1 || ':' || $2, 0)`;

export class VersioningEngine {
  /**
   * Records a new version for an entity — version numbers start at 1 and
   * increment per (entityType, entityId), serialized against concurrent
   * callers for the same entity via an advisory lock held for the
   * transaction's lifetime.
   */
  async recordVersion(
    entityType: string,
    entityId: string,
    fieldSnapshot: Record<string, unknown>,
    changedBy: string | null,
    changeReason?: string
  ): Promise<EntityVersion> {
    const client = await sharedPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(${LOCK_KEY_EXPR})`, [entityType, entityId]);
      const current = await client.query<{ max: number | null }>(
        `SELECT MAX(version) AS max FROM entity_versions WHERE entity_type = $1 AND entity_id = $2`,
        [entityType, entityId]
      );
      const nextVersion = (current.rows[0]?.max ?? 0) + 1;
      const inserted = await client.query<Row>(
        `INSERT INTO entity_versions (entity_type, entity_id, version, field_snapshot, changed_by, change_reason)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [entityType, entityId, nextVersion, JSON.stringify(fieldSnapshot), changedBy, changeReason ?? null]
      );
      await client.query('COMMIT');
      const row = inserted.rows[0];
      if (!row) throw new Error('entity_versions insert returned no row');
      return toVersion(row);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async getHistory(entityType: string, entityId: string, limit = 50): Promise<EntityVersion[]> {
    const res = await sharedPool.query<Row>(
      `SELECT * FROM entity_versions WHERE entity_type = $1 AND entity_id = $2 ORDER BY version DESC LIMIT $3`,
      [entityType, entityId, limit]
    );
    return res.rows.map(toVersion);
  }

  async getVersion(entityType: string, entityId: string, version: number): Promise<EntityVersion | null> {
    const res = await sharedPool.query<Row>(
      `SELECT * FROM entity_versions WHERE entity_type = $1 AND entity_id = $2 AND version = $3`,
      [entityType, entityId, version]
    );
    const row = res.rows[0];
    return row ? toVersion(row) : null;
  }

  async getCurrentVersionNumber(entityType: string, entityId: string): Promise<number> {
    const res = await sharedPool.query<{ max: number | null }>(
      `SELECT MAX(version) AS max FROM entity_versions WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId]
    );
    return res.rows[0]?.max ?? 0;
  }

  /**
   * Shallow key-level diff between two recorded versions of the same
   * entity — real field-by-field comparison, never a fabricated summary.
   * Returns only keys whose JSON-stringified value actually changed.
   */
  async diff(entityType: string, entityId: string, fromVersion: number, toVersionNum: number): Promise<Array<{ field: string; from: unknown; to: unknown }>> {
    const [from, to] = await Promise.all([
      this.getVersion(entityType, entityId, fromVersion),
      this.getVersion(entityType, entityId, toVersionNum),
    ]);
    if (!from || !to) return [];
    const keys = new Set([...Object.keys(from.fieldSnapshot), ...Object.keys(to.fieldSnapshot)]);
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
    for (const key of keys) {
      const a = from.fieldSnapshot[key];
      const b = to.fieldSnapshot[key];
      if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: key, from: a, to: b });
    }
    return changes;
  }
}
