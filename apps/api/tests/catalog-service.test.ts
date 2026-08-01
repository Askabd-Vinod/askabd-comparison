import { describe, it, expect, vi } from 'vitest';
import { CatalogService } from '../src/services/catalog-service-prisma.js';

function mockPrisma() {
  const items: any[] = []; const media: any[] = []; const relations: any[] = [];
  let counter = 0;
  const uid = () => `00000000-0000-0000-0000-00000000${String(++counter).padStart(4, '0')}`;

  return {
    item: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: uid(), ...data, rating: 0, review_count: 0, created_at: new Date(), updated_at: new Date() };
        items.push(row); return row;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const item = items.find(i => i.id === where.id);
        if (!item) throw { code: 'P2025' };
        Object.assign(item, data); return item;
      }),
    },
    item_media: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data }; media.push(row); return row; }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => media.filter(m => m.item_id === where.item_id)),
    },
    item_relation: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, sort_order: 0 }; relations.push(row); return row; }),
      findMany: vi.fn().mockImplementation(async ({ where, include }: any) => {
        const rels = relations.filter(r => r.item_id === where.item_id);
        if (include?.item_item_relation_related_item_idToitem) {
          return rels.map(r => ({ ...r, item_item_relation_related_item_idToitem: items.find(i => i.id === r.related_item_id) }));
        }
        return rels;
      }),
    },
  };
}

describe('CatalogService (Prisma)', () => {
  it('creates a catalog item with specifications', async () => {
    const svc = new CatalogService(mockPrisma() as any);
    const r = await svc.createItem({ categoryId: 'cat_phones', name: 'iPhone 16 Pro', slug: 'iphone-16-pro', specifications: { ram: '8GB', storage: '256GB', screen: '6.3"' }, pros: ['Great camera', 'Fast'], cons: ['Expensive'], priceCurrent: 99900, tags: ['apple', 'flagship'] });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.name).toBe('iPhone 16 Pro');
    expect(r.value.specifications.ram).toBe('8GB');
    expect(r.value.pros).toContain('Great camera');
    expect(r.value.tags).toContain('apple');
  });

  it('rejects item without name', async () => {
    const svc = new CatalogService(mockPrisma() as any);
    const r = await svc.createItem({ categoryId: 'cat_1', name: '', slug: '' });
    expect(r.ok).toBe(false);
  });

  it('adds media to item', async () => {
    const svc = new CatalogService(mockPrisma() as any);
    const item = await svc.createItem({ categoryId: 'cat_1', name: 'X', slug: 'x' });
    if (!item.ok) return;
    const r = await svc.addMedia({ itemId: item.value.id, type: 'image', url: 'https://cdn.example.com/img.jpg', altText: 'Product photo', isPrimary: true });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.isPrimary).toBe(true);
    const mediaList = await svc.getMedia(item.value.id);
    expect(mediaList).toHaveLength(1);
  });

  it('adds related items', async () => {
    const svc = new CatalogService(mockPrisma() as any);
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
    const svc = new CatalogService(mockPrisma() as any);
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
    const svc = new CatalogService(mockPrisma() as any);
    const phone = await svc.createItem({ categoryId: 'electronics', name: 'Galaxy S25', slug: 'galaxy-s25', specifications: { ram: '12GB', battery: '5000mAh' } });
    const insurance = await svc.createItem({ categoryId: 'insurance', name: 'Term Life', slug: 'term-life', specifications: { coverage: '1000000', premium_monthly: '50' } });
    const hotel = await svc.createItem({ categoryId: 'hotels', name: 'Marriott', slug: 'marriott', specifications: { stars: 5, pool: true } });
    expect(phone.ok).toBe(true);
    expect(insurance.ok).toBe(true);
    expect(hotel.ok).toBe(true);
  });
});
