import { describe, it, expect } from 'vitest';
import { PriceEngine } from '../src/services/price-engine.js';

function mockDb() {
  const prices: any[] = []; const offers: any[] = [];
  return { query: async <T>(sql: string, params?: unknown[]) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into item_price')) {
      const [id, item_id, variant_id, merchant_id, price, original_price, currency, source_url, is_affiliate, valid_until] = params as any[];
      const row = { id, item_id, variant_id, merchant_id, price, original_price, currency, source_url, is_affiliate, valid_from: new Date(), valid_until, recorded_at: new Date() };
      prices.push(row); return { rows: [row] as T[], rowCount: 1 };
    }
    if (s.includes('select') && s.includes('item_price') && s.includes('order by price asc')) {
      const [itemId] = params as string[]; const sorted = prices.filter((p) => p.item_id === itemId).sort((a: any, b: any) => a.price - b.price);
      return { rows: sorted.slice(0, 1) as T[], rowCount: sorted.length };
    }
    if (s.includes('select') && s.includes('item_price') && s.includes('item_id=$1')) {
      const [itemId] = params as string[]; return { rows: prices.filter((p) => p.item_id === itemId) as T[], rowCount: 0 };
    }
    if (s.includes('insert into offer')) {
      const [id, item_id, merchant_id, type, title, description, code, discount_value, discount_type, valid_from, valid_until, terms, url, priority] = params as any[];
      const row = { id, item_id, merchant_id, type, title, description, code, discount_value, discount_type, valid_from, valid_until, terms, url, priority, status: 'active', created_at: new Date() };
      offers.push(row); return { rows: [row] as T[], rowCount: 1 };
    }
    if (s.includes('select') && s.includes('offer') && s.includes('item_id=$1')) {
      const [itemId] = params as string[]; return { rows: offers.filter((o) => o.item_id === itemId && o.status === 'active') as T[], rowCount: 0 };
    }
    if (s.includes('select') && s.includes('offer') && s.includes('order by priority')) {
      return { rows: offers.filter((o) => o.status === 'active').sort((a: any, b: any) => b.priority - a.priority) as T[], rowCount: 0 };
    }
    return { rows: [] as T[], rowCount: 0 };
  }};
}

describe('PriceEngine', () => {
  it('records a price', async () => {
    const svc = new PriceEngine(mockDb() as any);
    const r = await svc.recordPrice({ itemId: 'item_1', price: 99900, currency: 'USD', merchantId: 'merchant_1' });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.price).toBe(99900);
    expect(r.value.merchantId).toBe('merchant_1');
  });

  it('gets lowest price', async () => {
    const svc = new PriceEngine(mockDb() as any);
    await svc.recordPrice({ itemId: 'i1', price: 500, merchantId: 'm1' });
    await svc.recordPrice({ itemId: 'i1', price: 300, merchantId: 'm2' });
    await svc.recordPrice({ itemId: 'i1', price: 700, merchantId: 'm3' });
    const lowest = await svc.getLowestPrice('i1');
    expect(lowest).not.toBeNull();
    expect(lowest!.price).toBe(300);
  });

  it('tracks price history', async () => {
    const svc = new PriceEngine(mockDb() as any);
    await svc.recordPrice({ itemId: 'i1', price: 100 });
    await svc.recordPrice({ itemId: 'i1', price: 90 });
    await svc.recordPrice({ itemId: 'i1', price: 95 });
    const history = await svc.getPriceHistory('i1');
    expect(history).toHaveLength(3);
  });

  it('creates an offer', async () => {
    const svc = new PriceEngine(mockDb() as any);
    const r = await svc.createOffer({ itemId: 'i1', type: 'coupon', title: '10% Off', code: 'SAVE10', discountValue: 10, discountType: 'percent' });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.code).toBe('SAVE10');
    expect(r.value.discountValue).toBe(10);
  });

  it('gets active offers for item', async () => {
    const svc = new PriceEngine(mockDb() as any);
    await svc.createOffer({ itemId: 'i1', type: 'discount', title: 'Flash Sale', priority: 10 });
    await svc.createOffer({ itemId: 'i1', type: 'cashback', title: '5% Cashback', priority: 5 });
    const offers = await svc.getActiveOffers('i1');
    expect(offers).toHaveLength(2);
  });
});
