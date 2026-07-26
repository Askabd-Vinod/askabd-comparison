import { describe, it, expect } from 'vitest';
import { CatalogService } from '../src/services/catalog-service.js';

function mockDb() {
  const items: any[] = []; const media: any[] = []; const relations: any[] = [];
  return { query: async <T>(sql: string, params?: unknown[]) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into item') && !s.includes('media') && !s.includes('relation')) {
      const [id,,categoryId,brandId,merchantId,name,slug,description,specifications,pros,cons,pc,po,currency,avail,tags,source,locale] = params as any[];
      const row = { id, tenant_id: 'public', category_id: categoryId, brand_id: brandId, merchant_id: merchantId, name, slug, description, specifications: JSON.parse(specifications), pros, cons, price_current: pc, price_original: po, price_currency: currency, availability: avail, tags, status: 'active', source, locale, rating: 0, review_count: 0, published_at: new Date(), created_at: new Date(), updated_at: new Date() };
      items.push(row); return { rows: [row] as T[], rowCount: 1 };
    }
    if (s.includes('update item')) { const id = params?.[params!.length - 1] as string; const item = items.find((i) => i.id === id); if (item && params?.[0]) item.name = params[0]; return { rows: item ? [item] as T[] : [] as T[], rowCount: item ? 1 : 0 }; }
    if (s.includes('insert into item_media')) { const [id, item_id, type, url, thumbnail_url, alt_text, caption, sort_order, is_primary] = params as any[]; const row = { id, item_id, type, url, thumbnail_url, alt_text, caption, sort_order, is_primary }; media.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('select') && s.includes('item_media')) { const [itemId] = params as string[]; return { rows: media.filter((m) => m.item_id === itemId) as T[], rowCount: 0 }; }
    if (s.includes('insert into item_relation')) { const [id, item_id, related_item_id, relation_type] = params as any[]; const row = { id, item_id, related_item_id, relation_type, sort_order: 0 }; relations.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('select') && s.includes('item_relation')) { const [itemId] = params as string[]; const relIds = relations.filter((r) => r.item_id === itemId).map((r) => r.related_item_id); return { rows: items.filter((i) => relIds.includes(i.id)) as T[], rowCount: 0 }; }
    return { rows: [] as T[], rowCount: 0 };
  }};
}

describe('CatalogService', () => {
  it('creates a catalog item with specifications', async () => {
    const svc = new CatalogService(mockDb() as any);
    const r = await svc.createItem({ categoryId: 'cat_phones', name: 'iPhone 16 Pro', slug: 'iphone-16-pro', specifications: { ram: '8GB', storage: '256GB', screen: '6.3"' }, pros: ['Great camera', 'Fast'], cons: ['Expensive'], priceCurrent: 99900, tags: ['apple', 'flagship'] });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.name).toBe('iPhone 16 Pro');
    expect(r.value.specifications.ram).toBe('8GB');
    expect(r.value.pros).toContain('Great camera');
    expect(r.value.tags).toContain('apple');
  });

  it('rejects item without name', async () => {
    const svc = new CatalogService(mockDb() as any);
    const r = await svc.createItem({ categoryId: 'cat_1', name: '', slug: '' });
    expect(r.ok).toBe(false);
  });

  it('adds media to item', async () => {
    const svc = new CatalogService(mockDb() as any);
    const item = await svc.createItem({ categoryId: 'cat_1', name: 'X', slug: 'x' });
    if (!item.ok) return;
    const r = await svc.addMedia({ itemId: item.value.id, type: 'image', url: 'https://cdn.example.com/img.jpg', altText: 'Product photo', isPrimary: true });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.isPrimary).toBe(true);
    const media = await svc.getMedia(item.value.id);
    expect(media).toHaveLength(1);
  });

  it('adds related items', async () => {
    const svc = new CatalogService(mockDb() as any);
    const a = await svc.createItem({ categoryId: 'c', name: 'A', slug: 'a' });
    const b = await svc.createItem({ categoryId: 'c', name: 'B', slug: 'b' });
    if (!a.ok || !b.ok) return;
    const r = await svc.addRelation({ itemId: a.value.id, relatedItemId: b.value.id, relationType: 'alternative' });
    expect(r.ok).toBe(true);
    const related = await svc.getRelated(a.value.id);
    expect(related).toHaveLength(1);
    expect(related[0]!.name).toBe('B');
  });

  it('supports bulk import', async () => {
    const svc = new CatalogService(mockDb() as any);
    const r = await svc.bulkImport([
      { categoryId: 'c', name: 'Item 1', slug: 'item-1' },
      { categoryId: 'c', name: 'Item 2', slug: 'item-2' },
      { categoryId: 'c', name: 'Item 3', slug: 'item-3' },
    ]);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.imported).toBe(3);
    expect(r.value.errors).toBe(0);
  });

  it('supports any domain via specifications', async () => {
    const svc = new CatalogService(mockDb() as any);
    // Electronics
    const phone = await svc.createItem({ categoryId: 'electronics', name: 'Galaxy S25', slug: 'galaxy-s25', specifications: { ram: '12GB', battery: '5000mAh', os: 'Android 15' } });
    // Insurance
    const insurance = await svc.createItem({ categoryId: 'insurance', name: 'Term Life Plan', slug: 'term-life', specifications: { coverage: '1000000', premium_monthly: '50', term_years: '20', claim_ratio: '98.5%' } });
    // Hotel
    const hotel = await svc.createItem({ categoryId: 'hotels', name: 'Marriott Downtown', slug: 'marriott-downtown', specifications: { stars: 5, rooms: 400, pool: true, wifi: true, breakfast: true } });
    expect(phone.ok).toBe(true);
    expect(insurance.ok).toBe(true);
    expect(hotel.ok).toBe(true);
  });
});
