import { describe, expect, it } from 'vitest';
import { SearchService } from '../src/services/search-service.js';

function mockDb() {
  const categories = [
    { id: 'cat_1', tenant_id: 'public', name: 'Apple Accessories', slug: 'apple-accessories', description: 'Phones and gadgets', icon: '📱', active: true },
  ];
  const items = [
    { id: 'item_1', tenant_id: 'public', category_id: 'cat_1', name: 'iPhone 16', slug: 'iphone-16', brand: 'Apple', description: 'A premium phone', price_current: 999, price_currency: 'USD', rating: 4.8, review_count: 128, merchant: 'Apple Store', availability: 'in_stock', status: 'active' },
  ];
  const brands = [
    { id: 'brand_1', name: 'Apple', slug: 'apple', description: 'Consumer electronics', verified: true, status: 'active' },
  ];

  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from category')) {
        return { rows: categories as T[], rowCount: categories.length };
      }
      if (normalized.includes('from item')) {
        const query = String(params?.[1] ?? params?.[0] ?? '').replace(/%/g, '');
        const rows = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.brand.toLowerCase().includes(query.toLowerCase()));
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (normalized.includes('from brand')) {
        const query = String(params?.[1] ?? params?.[0] ?? '').replace(/%/g, '');
        const rows = brands.filter((brand) => brand.name.toLowerCase().includes(query.toLowerCase()) || brand.slug.toLowerCase().includes(query.toLowerCase()));
        return { rows: rows as T[], rowCount: rows.length };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

describe('SearchService', () => {
  it('aggregates categories, items, and brands for a query', async () => {
    const svc = new SearchService(mockDb() as any);
    const results = await svc.search('apple');

    expect(results.query).toBe('apple');
    expect(results.items).toHaveLength(1);
    expect(results.categories).toHaveLength(1);
    expect(results.brands).toHaveLength(1);
  });
});
