import { describe, expect, it } from 'vitest';
import { CategoryService } from '../src/services/comparison-engine.js';

function mockDb() {
  const categories: any[] = [
    { id: 'cat_1', tenant_id: 'public', name: 'Electronics', slug: 'electronics', parent_id: null, icon: '📱', description: 'Devices and gadgets', comparison_template: [], sort_order: 1, active: true },
  ];
  const items: any[] = [
    { id: 'item_1', category_id: 'cat_1', status: 'active' },
    { id: 'item_2', category_id: 'cat_1', status: 'active' },
    { id: 'item_3', category_id: 'cat_2', status: 'active' },
  ];

  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('select * from category')) {
        return { rows: categories as T[], rowCount: categories.length };
      }
      if (normalized.includes('select count(*)::int as count from item where category_id=$1 and status=$2')) {
        const [categoryId] = params as string[];
        return { rows: [{ count: items.filter((item) => item.category_id === categoryId && item.status === 'active').length }] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

describe('CategoryService', () => {
  it('exposes item counts for category listings', async () => {
    const svc = new CategoryService(mockDb() as any);
    const categories = await svc.list();

    expect(categories).toHaveLength(1);
    expect(categories[0]?.itemCount).toBe(2);
  });

  it('exposes item counts for a category lookup by slug', async () => {
    const svc = new CategoryService(mockDb() as any);
    const category = await svc.getBySlug('electronics');

    expect(category).not.toBeNull();
    expect(category?.itemCount).toBe(2);
  });
});
