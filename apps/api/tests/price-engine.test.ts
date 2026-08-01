import { describe, it, expect, vi } from 'vitest';
import { PriceEngine } from '../src/services/price-engine-prisma.js';

function mockPrisma() {
  const prices: any[] = []; const offers: any[] = [];
  let counter = 0;
  const uid = () => `00000000-0000-0000-0000-00000000${String(++counter).padStart(4, '0')}`;

  return {
    item_price: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, valid_from: new Date(), recorded_at: new Date() }; prices.push(row); return row; }),
      findMany: vi.fn().mockImplementation(async ({ where, orderBy }: any) => {
        let filtered = prices.filter(p => p.item_id === where.item_id);
        if (where.merchant_id) {
          if (where.merchant_id.not === null) filtered = filtered.filter(p => p.merchant_id != null);
          else filtered = filtered.filter(p => p.merchant_id === where.merchant_id);
        }
        if (orderBy) {
          if (Array.isArray(orderBy)) {
            filtered.sort((a: any, b: any) => (a.merchant_id ?? '').localeCompare(b.merchant_id ?? '') || (b.recorded_at - a.recorded_at));
          } else if (orderBy.recorded_at === 'desc') filtered.sort((a: any, b: any) => b.recorded_at - a.recorded_at);
        }
        return filtered;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where, orderBy }: any) => {
        const filtered = prices.filter(p => p.item_id === where.item_id);
        if (orderBy?.price === 'asc') filtered.sort((a: any, b: any) => Number(a.price) - Number(b.price));
        return filtered[0] ?? null;
      }),
    },
    offer: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, status: 'active', created_at: new Date() }; offers.push(row); return row; }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        let filtered = offers.filter(o => o.status === 'active');
        if (where?.item_id) filtered = filtered.filter(o => o.item_id === where.item_id);
        return filtered.sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0));
      }),
    },
  };
}

describe('PriceEngine (Prisma)', () => {
  it('records a price', async () => {
    const svc = new PriceEngine(mockPrisma() as any);
    const r = await svc.recordPrice({ itemId: 'item_1', price: 99900, currency: 'USD', merchantId: 'merchant_1' });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.price).toBe(99900);
    expect(r.value.merchantId).toBe('merchant_1');
  });

  it('gets lowest price', async () => {
    const svc = new PriceEngine(mockPrisma() as any);
    await svc.recordPrice({ itemId: 'i1', price: 500, merchantId: 'm1' });
    await svc.recordPrice({ itemId: 'i1', price: 300, merchantId: 'm2' });
    await svc.recordPrice({ itemId: 'i1', price: 700, merchantId: 'm3' });
    const lowest = await svc.getLowestPrice('i1');
    expect(lowest).not.toBeNull();
    expect(lowest!.price).toBe(300);
  });

  it('tracks price history', async () => {
    const svc = new PriceEngine(mockPrisma() as any);
    await svc.recordPrice({ itemId: 'i1', price: 100 });
    await svc.recordPrice({ itemId: 'i1', price: 90 });
    await svc.recordPrice({ itemId: 'i1', price: 95 });
    const history = await svc.getPriceHistory('i1');
    expect(history).toHaveLength(3);
  });

  it('creates an offer', async () => {
    const svc = new PriceEngine(mockPrisma() as any);
    const r = await svc.createOffer({ itemId: 'i1', type: 'coupon', title: '10% Off', code: 'SAVE10', discountValue: 10, discountType: 'percent' });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.code).toBe('SAVE10');
    expect(r.value.discountValue).toBe(10);
  });

  it('gets active offers for item', async () => {
    const svc = new PriceEngine(mockPrisma() as any);
    await svc.createOffer({ itemId: 'i1', type: 'discount', title: 'Flash Sale', priority: 10 });
    await svc.createOffer({ itemId: 'i1', type: 'cashback', title: '5% Cashback', priority: 5 });
    const offers = await svc.getActiveOffers('i1');
    expect(offers).toHaveLength(2);
  });
});
