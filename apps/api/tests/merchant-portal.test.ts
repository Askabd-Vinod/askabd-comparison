import { describe, it, expect, vi } from 'vitest';
import { InventoryService, PricingConsole, CampaignService } from '../src/services/merchant-portal-prisma.js';

function mockPrisma() {
  const inventory: any[] = []; const history: any[] = []; const rules: any[] = []; const campaigns: any[] = [];
  let counter = 0;
  const uid = () => `00000000-0000-0000-0000-00000000${String(++counter).padStart(4, '0')}`;

  return {
    inventory: {
      upsert: vi.fn().mockImplementation(async ({ create }: any) => { const row = { id: uid(), ...create, reserved: 0, location: null }; inventory.push(row); return row; }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => inventory.find(i => i.id === where.id) ?? null),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => { const inv = inventory.find(i => i.id === where.id); if (inv) Object.assign(inv, data); return inv; }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        let filtered = inventory.filter(i => i.merchant_id === where.merchant_id);
        if (where.status?.in) filtered = filtered.filter(i => where.status.in.includes(i.status));
        else if (where.status) filtered = filtered.filter(i => i.status === where.status);
        return filtered;
      }),
    },
    inventory_history: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, created_at: new Date() }; history.push(row); return row; }),
    },
    price_rule: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, active: true, valid_from: new Date(), valid_until: null }; rules.push(row); return row; }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => rules.filter(r => r.merchant_id === where.merchant_id && r.active)),
    },
    campaign: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, created_at: new Date() }; campaigns.push(row); return row; }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => { const c = campaigns.find(x => x.id === where.id && x.status === (where.status ?? x.status)); if (!c) throw { code: 'P2025' }; Object.assign(c, data); return c; }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => campaigns.filter(c => c.merchant_id === where.merchant_id)),
    },
    $transaction: vi.fn().mockImplementation(async (ops: any[]) => { const results = []; for (const op of ops) results.push(await op); return results; }),
  };
}

describe('InventoryService (Prisma)', () => {
  it('sets stock', async () => { const svc = new InventoryService(mockPrisma() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: 100 }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.quantity).toBe(100); expect(r.value.status).toBe('in_stock'); });
  it('detects low stock', async () => { const svc = new InventoryService(mockPrisma() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: 3, lowStockThreshold: 5 }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('low_stock'); });
  it('detects out of stock', async () => { const svc = new InventoryService(mockPrisma() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: 0 }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('out_of_stock'); });
  it('rejects negative quantity', async () => { const svc = new InventoryService(mockPrisma() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: -5 }); expect(r.ok).toBe(false); });
});

describe('PricingConsole (Prisma)', () => {
  it('creates a price rule', async () => { const svc = new PricingConsole(mockPrisma() as any); const r = await svc.createRule({ merchantId: 'm1', ruleType: 'discount', name: '10% Off Electronics', config: { percent: 10, categoryId: 'cat_elec' } }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.name).toBe('10% Off Electronics'); });
});

describe('CampaignService (Prisma)', () => {
  it('creates and activates a campaign', async () => { const svc = new CampaignService(mockPrisma() as any); const c = await svc.create({ name: 'Summer Sale', type: 'seasonal' }); expect(c.ok).toBe(true); if (!c.ok) return; expect(c.value.status).toBe('draft'); const r = await svc.activate(c.value.id); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('active'); });
});
