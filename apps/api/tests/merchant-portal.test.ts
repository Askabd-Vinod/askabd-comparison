import { describe, it, expect } from 'vitest';
import { InventoryService, PricingConsole, CampaignService } from '../src/services/merchant-portal-service.js';

function mockDb() {
  const inventory: any[] = []; const history: any[] = []; const rules: any[] = []; const campaigns: any[] = [];
  return { query: async <T>(sql: string, params?: unknown[]) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into inventory')) { const [id,item_id,,merchant_id,warehouse,quantity,low_stock_threshold,status] = params as any[]; const row = { id, item_id, variant_id: null, merchant_id, warehouse, quantity, reserved: 0, low_stock_threshold, status, location: null }; inventory.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('select') && s.includes('inventory') && s.includes('id=$1')) { const [id] = params as string[]; return { rows: inventory.filter((i) => i.id === id) as T[], rowCount: 0 }; }
    if (s.includes('select') && s.includes('inventory') && s.includes('merchant_id=$1') && s.includes('low_stock')) { const [mid] = params as string[]; return { rows: inventory.filter((i) => i.merchant_id === mid && (i.status === 'low_stock' || i.status === 'out_of_stock')) as T[], rowCount: 0 }; }
    if (s.includes('select') && s.includes('inventory') && s.includes('merchant_id=$1')) { const [mid] = params as string[]; return { rows: inventory.filter((i) => i.merchant_id === mid) as T[], rowCount: 0 }; }
    if (s.includes('update inventory')) { const [qty, status, id] = params as any[]; const inv = inventory.find((i) => i.id === id); if (inv) { inv.quantity = qty; inv.status = status; } return { rows: [] as T[], rowCount: 1 }; }
    if (s.includes('insert into inventory_history')) { history.push(params); return { rows: [] as T[], rowCount: 1 }; }
    if (s.includes('insert into price_rule')) { const [id,,,,ruleType,name,config,priority] = params as any[]; const row = { id, merchant_id: null, item_id: null, category_id: null, rule_type: ruleType, name, config: JSON.parse(config), priority, active: true, valid_from: new Date(), valid_until: null }; rules.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('select') && s.includes('price_rule')) { return { rows: rules as T[], rowCount: rules.length }; }
    if (s.includes('insert into campaign')) { const [id,,tenant_id,name,type,status] = params as any[]; const row = { id, merchant_id: null, tenant_id, name, type, status, starts_at: null, ends_at: null, config: {}, item_ids: [], category_ids: [], created_at: new Date() }; campaigns.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('update campaign')) { const [id] = params as string[]; const c = campaigns.find((x) => x.id === id); if (c) c.status = 'active'; return { rows: c ? [c] as T[] : [] as T[], rowCount: c ? 1 : 0 }; }
    if (s.includes('select') && s.includes('campaign')) { return { rows: campaigns as T[], rowCount: campaigns.length }; }
    return { rows: [] as T[], rowCount: 0 };
  }};
}

describe('InventoryService', () => {
  it('sets stock', async () => { const svc = new InventoryService(mockDb() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: 100 }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.quantity).toBe(100); expect(r.value.status).toBe('in_stock'); });
  it('detects low stock', async () => { const svc = new InventoryService(mockDb() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: 3, lowStockThreshold: 5 }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('low_stock'); });
  it('detects out of stock', async () => { const svc = new InventoryService(mockDb() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: 0 }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('out_of_stock'); });
  it('rejects negative quantity', async () => { const svc = new InventoryService(mockDb() as any); const r = await svc.setStock({ itemId: 'i1', merchantId: 'm1', quantity: -5 }); expect(r.ok).toBe(false); });
});

describe('PricingConsole', () => {
  it('creates a price rule', async () => { const svc = new PricingConsole(mockDb() as any); const r = await svc.createRule({ merchantId: 'm1', ruleType: 'discount', name: '10% Off Electronics', config: { percent: 10, categoryId: 'cat_elec' } }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.name).toBe('10% Off Electronics'); });
});

describe('CampaignService', () => {
  it('creates and activates a campaign', async () => { const svc = new CampaignService(mockDb() as any); const c = await svc.create({ name: 'Summer Sale', type: 'seasonal' }); expect(c.ok).toBe(true); if (!c.ok) return; expect(c.value.status).toBe('draft'); const r = await svc.activate(c.value.id); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('active'); });
});
