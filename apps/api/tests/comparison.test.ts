import { describe, it, expect } from 'vitest';
import { ComparisonService } from '../src/services/comparison-engine.js';

function mockDb() {
  const comparisons: any[] = [];
  return { query: async <T>(sql: string, params?: unknown[]) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into comparison')) {
      const [id, user_id, title, category_id, item_ids, notes, is_public, share_token] = params as any[];
      const row = { id, user_id, title, category_id, item_ids, notes, is_public, share_token, created_at: new Date() };
      comparisons.push(row); return { rows: [row] as T[], rowCount: 1 };
    }
    if (s.includes('select') && s.includes('comparison') && s.includes('user_id')) {
      const [uid] = params as string[]; return { rows: comparisons.filter((c) => c.user_id === uid) as T[], rowCount: 0 };
    }
    return { rows: [] as T[], rowCount: 0 };
  }};
}

describe('ComparisonService', () => {
  it('creates a comparison with 2+ items', async () => {
    const svc = new ComparisonService(mockDb() as any);
    const r = await svc.create({ userId: 'u1', itemIds: ['i1', 'i2'], title: 'Phone vs Phone' });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.itemIds).toHaveLength(2);
    expect(r.value.userId).toBe('u1');
  });

  it('rejects comparison with < 2 items', async () => {
    const svc = new ComparisonService(mockDb() as any);
    const r = await svc.create({ userId: 'u1', itemIds: ['i1'] });
    expect(r.ok).toBe(false); if (r.ok) return;
    expect(r.error.code).toBe('min_items');
  });

  it('generates share token for public comparisons', async () => {
    const svc = new ComparisonService(mockDb() as any);
    const r = await svc.create({ userId: 'u1', itemIds: ['i1', 'i2', 'i3'], isPublic: true });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.shareToken).toBeTruthy();
    expect(r.value.isPublic).toBe(true);
  });

  it('lists comparisons by user', async () => {
    const svc = new ComparisonService(mockDb() as any);
    await svc.create({ userId: 'u1', itemIds: ['a', 'b'] });
    await svc.create({ userId: 'u1', itemIds: ['c', 'd'] });
    const list = await svc.listByUser('u1');
    expect(list).toHaveLength(2);
  });
});
