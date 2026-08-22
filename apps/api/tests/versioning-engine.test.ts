/**
 * Generic Versioning Engine — migration 039, versioning-engine.ts. Proves
 * real Postgres persistence, real per-entity version-number sequencing,
 * real concurrency-safety (advisory lock), and the real field-diff helper.
 * Uses a synthetic entity_type so this suite never collides with any real
 * entity's version history.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { VersioningEngine } from '../src/services/versioning-engine.js';
import { sharedPool } from '../src/services/db-pool.js';

const ENTITY_TYPE = 'test_fixture_entity';
const cleanupEntityIds: string[] = [];

afterAll(async () => {
  for (const id of cleanupEntityIds) {
    await sharedPool.query('DELETE FROM entity_versions WHERE entity_type = $1 AND entity_id = $2', [ENTITY_TYPE, id]).catch(() => {});
  }
});

function freshEntityId(): string {
  const id = `fixture-${randomUUID()}`;
  cleanupEntityIds.push(id);
  return id;
}

describe('VersioningEngine — basic sequencing', () => {
  it('the first recorded version for a new entity is version 1', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    const v = await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'first' }, 'actor-1');
    expect(v.version).toBe(1);
    expect(v.fieldSnapshot).toEqual({ title: 'first' });
    expect(v.changedBy).toBe('actor-1');
  });

  it('successive versions for the same entity increment by 1, never reuse or skip', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    const v1 = await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'v1' }, 'actor-1');
    const v2 = await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'v2' }, 'actor-1');
    const v3 = await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'v3' }, 'actor-1');
    expect([v1.version, v2.version, v3.version]).toEqual([1, 2, 3]);
  });

  it('different entities of the same type version independently, starting at 1 each', async () => {
    const engine = new VersioningEngine();
    const entityA = freshEntityId();
    const entityB = freshEntityId();
    await engine.recordVersion(ENTITY_TYPE, entityA, { title: 'a-v1' }, null);
    await engine.recordVersion(ENTITY_TYPE, entityA, { title: 'a-v2' }, null);
    const bVersion = await engine.recordVersion(ENTITY_TYPE, entityB, { title: 'b-v1' }, null);
    expect(bVersion.version).toBe(1);
    expect(await engine.getCurrentVersionNumber(ENTITY_TYPE, entityA)).toBe(2);
  });

  it('a real, optional change_reason is persisted and returned', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    const v = await engine.recordVersion(ENTITY_TYPE, entityId, { status: 'active' }, 'actor-1', 'Initial creation');
    expect(v.changeReason).toBe('Initial creation');
  });
});

describe('VersioningEngine — history and lookup', () => {
  it('getHistory returns real rows in descending version order', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    await engine.recordVersion(ENTITY_TYPE, entityId, { n: 1 }, null);
    await engine.recordVersion(ENTITY_TYPE, entityId, { n: 2 }, null);
    await engine.recordVersion(ENTITY_TYPE, entityId, { n: 3 }, null);
    const history = await engine.getHistory(ENTITY_TYPE, entityId);
    expect(history.map(h => h.version)).toEqual([3, 2, 1]);
  });

  it('getVersion retrieves the exact real snapshot at a specific version, not the latest', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'original' }, null);
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'revised' }, null);
    const v1 = await engine.getVersion(ENTITY_TYPE, entityId, 1);
    expect(v1?.fieldSnapshot).toEqual({ title: 'original' });
  });

  it('getVersion for a nonexistent version returns null, never a fabricated fallback', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'only version' }, null);
    const missing = await engine.getVersion(ENTITY_TYPE, entityId, 99);
    expect(missing).toBeNull();
  });

  it('getCurrentVersionNumber for a never-versioned entity returns 0, not an error or a fabricated 1', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    expect(await engine.getCurrentVersionNumber(ENTITY_TYPE, entityId)).toBe(0);
  });
});

describe('VersioningEngine — concurrency safety', () => {
  it('10 concurrent recordVersion calls for the SAME entity produce exactly versions 1-10, no duplicates, no gaps', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => engine.recordVersion(ENTITY_TYPE, entityId, { n: i }, 'concurrent-actor'))
    );
    const versions = results.map(r => r.version).sort((a, b) => a - b);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(versions).size).toBe(10); // no duplicates — the advisory lock genuinely serialized these
  });
});

describe('VersioningEngine — field diff', () => {
  it('diff reports only the real fields that actually changed between two versions', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'Order System', priority: 'medium', owner: 'Alice' }, null);
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'Order System', priority: 'high', owner: 'Bob' }, null);
    const changes = await engine.diff(ENTITY_TYPE, entityId, 1, 2);
    const byField = Object.fromEntries(changes.map(c => [c.field, c]));
    expect(Object.keys(byField).sort()).toEqual(['owner', 'priority']); // title unchanged, correctly excluded
    expect(byField.priority).toEqual({ field: 'priority', from: 'medium', to: 'high' });
    expect(byField.owner).toEqual({ field: 'owner', from: 'Alice', to: 'Bob' });
  });

  it('diff between identical snapshots reports zero changes', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'Same' }, null);
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'Same' }, null);
    const changes = await engine.diff(ENTITY_TYPE, entityId, 1, 2);
    expect(changes).toEqual([]);
  });

  it('diff against a nonexistent version returns an empty array, never a crash or fabricated diff', async () => {
    const engine = new VersioningEngine();
    const entityId = freshEntityId();
    await engine.recordVersion(ENTITY_TYPE, entityId, { title: 'only' }, null);
    const changes = await engine.diff(ENTITY_TYPE, entityId, 1, 99);
    expect(changes).toEqual([]);
  });
});
