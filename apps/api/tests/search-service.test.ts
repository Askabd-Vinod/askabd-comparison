import { describe, expect, it, vi } from 'vitest';
import { SearchService } from '../src/services/search-service-prisma.js';

function mockPrisma() {
  const categories = [{ id: 'cat_1', name: 'Apple Accessories', slug: 'apple-accessories', description: 'Phones and gadgets', icon: '📱' }];
  const items = [{ id: 'item_1', name: 'iPhone 16', slug: 'iphone-16', brand_name: 'Apple', description: 'A premium phone', price_current: BigInt(999), price_currency: 'USD', rating: 4.8, review_count: 128, merchant_name: 'Apple Store', availability: 'in_stock' }];
  const brands = [{ id: 'brand_1', name: 'Apple', slug: 'apple', description: 'Consumer electronics', verified: true }];

  return {
    category: { findMany: vi.fn().mockResolvedValue(categories) },
    item: { findMany: vi.fn().mockResolvedValue(items) },
    brand: { findMany: vi.fn().mockResolvedValue(brands) },
  };
}

describe('SearchService (Prisma)', () => {
  it('aggregates categories, items, and brands for a query', async () => {
    const svc = new SearchService(mockPrisma() as any);
    const results = await svc.search('apple');

    expect(results.query).toBe('apple');
    expect(results.items).toHaveLength(1);
    expect(results.items[0]!.name).toBe('iPhone 16');
    expect(results.items[0]!.priceCurrent).toBe(999);
    expect(results.categories).toHaveLength(1);
    expect(results.categories[0]!.name).toBe('Apple Accessories');
    expect(results.brands).toHaveLength(1);
    expect(results.brands[0]!.verified).toBe(true);
  });

  it('returns empty for blank query', async () => {
    const svc = new SearchService(mockPrisma() as any);
    const results = await svc.search('  ');
    expect(results.query).toBe('');
    expect(results.items).toHaveLength(0);
  });
});
