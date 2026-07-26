import { randomUUID } from 'node:crypto';
import { DbClient } from '../db/connection.js';
import { type Result } from './comparison-engine.js';

export interface InventoryEntry { id: string; itemId: string; variantId?: string; merchantId: string; warehouse: string; location?: string; quantity: number; reserved: number; lowStockThreshold: number; status: string; }
export interface InventoryChange { id: string; inventoryId: string; changeType: string; quantityChange: number; quantityAfter: number; reason?: string; createdAt: Date; }
export interface PriceRule { id: string; merchantId?: string; itemId?: string; categoryId?: string; ruleType: string; name: string; config: Record<string, unknown>; priority: number; active: boolean; validFrom: Date; validUntil?: Date; }
export interface Campaign { id: string; merchantId?: string; tenantId: string; name: string; type: string; status: string; startsAt?: Date; endsAt?: Date; config: Record<string, unknown>; itemIds: string[]; categoryIds: string[]; }

export class InventoryService {
  constructor(private readonly db: DbClient) {}

  async setStock(input: { itemId: string; merchantId: string; variantId?: string; warehouse?: string; quantity: number; lowStockThreshold?: number }): Promise<Result<InventoryEntry>> {
    if (input.quantity < 0) return { ok: false, error: { category: 'validation', code: 'negative_qty', message: 'Quantity cannot be negative' } };
    const id = randomUUID(); const status = input.quantity === 0 ? 'out_of_stock' : input.quantity <= (input.lowStockThreshold ?? 5) ? 'low_stock' : 'in_stock';
    const r = await this.db.query<any>(
      `INSERT INTO inventory (id,item_id,variant_id,merchant_id,warehouse,quantity,low_stock_threshold,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (item_id,variant_id,merchant_id,warehouse) DO UPDATE SET quantity=$6, status=$8, updated_at=NOW() RETURNING *`,
      [id, input.itemId, input.variantId ?? null, input.merchantId, input.warehouse ?? 'default', input.quantity, input.lowStockThreshold ?? 5, status]);
    return { ok: true, value: this.mapInv(r.rows[0]!) };
  }

  async adjustStock(inventoryId: string, change: number, changeType: string, reason?: string, actorId?: string): Promise<Result<InventoryEntry>> {
    const inv = await this.db.query<any>('SELECT * FROM inventory WHERE id=$1', [inventoryId]);
    if (inv.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Inventory not found' } };
    const current = inv.rows[0]!;
    const newQty = current.quantity + change;
    if (newQty < 0) return { ok: false, error: { category: 'validation', code: 'insufficient_stock', message: 'Insufficient stock' } };
    const status = newQty === 0 ? 'out_of_stock' : newQty <= current.low_stock_threshold ? 'low_stock' : 'in_stock';
    await this.db.query('UPDATE inventory SET quantity=$1, status=$2, updated_at=NOW() WHERE id=$3', [newQty, status, inventoryId]);
    await this.db.query('INSERT INTO inventory_history (id,inventory_id,change_type,quantity_change,quantity_after,reason,actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), inventoryId, changeType, change, newQty, reason ?? null, actorId ?? null]);
    return { ok: true, value: { ...this.mapInv(current), quantity: newQty, status } };
  }

  async getByMerchant(merchantId: string, status?: string): Promise<InventoryEntry[]> {
    const sql = status ? 'SELECT * FROM inventory WHERE merchant_id=$1 AND status=$2 ORDER BY updated_at DESC' : 'SELECT * FROM inventory WHERE merchant_id=$1 ORDER BY updated_at DESC';
    const r = await this.db.query<any>(sql, status ? [merchantId, status] : [merchantId]);
    return r.rows.map((row: any) => this.mapInv(row));
  }

  async getLowStock(merchantId: string): Promise<InventoryEntry[]> {
    const r = await this.db.query<any>("SELECT * FROM inventory WHERE merchant_id=$1 AND status IN ('low_stock','out_of_stock')", [merchantId]);
    return r.rows.map((row: any) => this.mapInv(row));
  }

  private mapInv(row: any): InventoryEntry { return { id: row.id, itemId: row.item_id, variantId: row.variant_id, merchantId: row.merchant_id, warehouse: row.warehouse, location: row.location, quantity: row.quantity, reserved: row.reserved, lowStockThreshold: row.low_stock_threshold, status: row.status }; }
}

export class PricingConsole {
  constructor(private readonly db: DbClient) {}

  async createRule(input: { merchantId?: string; itemId?: string; categoryId?: string; ruleType: string; name: string; config: Record<string, unknown>; priority?: number; validFrom?: Date; validUntil?: Date }): Promise<Result<PriceRule>> {
    if (!input.name || !input.ruleType) return { ok: false, error: { category: 'validation', code: 'required', message: 'name and ruleType required' } };
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO price_rule (id,merchant_id,item_id,category_id,rule_type,name,config,priority,valid_from,valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [id, input.merchantId ?? null, input.itemId ?? null, input.categoryId ?? null, input.ruleType, input.name, JSON.stringify(input.config), input.priority ?? 0, input.validFrom ?? new Date(), input.validUntil ?? null]);
    return { ok: true, value: this.mapRule(r.rows[0]!) };
  }

  async listRules(merchantId: string): Promise<PriceRule[]> {
    const r = await this.db.query<any>('SELECT * FROM price_rule WHERE merchant_id=$1 AND active=TRUE ORDER BY priority DESC', [merchantId]);
    return r.rows.map((row: any) => this.mapRule(row));
  }

  private mapRule(row: any): PriceRule { return { id: row.id, merchantId: row.merchant_id, itemId: row.item_id, categoryId: row.category_id, ruleType: row.rule_type, name: row.name, config: row.config, priority: row.priority, active: row.active, validFrom: row.valid_from, validUntil: row.valid_until }; }
}

export class CampaignService {
  constructor(private readonly db: DbClient) {}

  async create(input: { merchantId?: string; tenantId?: string; name: string; type: string; startsAt?: Date; endsAt?: Date; config?: Record<string, unknown>; itemIds?: string[]; categoryIds?: string[] }): Promise<Result<Campaign>> {
    if (!input.name) return { ok: false, error: { category: 'validation', code: 'name_required', message: 'Name required' } };
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO campaign (id,merchant_id,tenant_id,name,type,status,starts_at,ends_at,config,item_ids,category_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [id, input.merchantId ?? null, input.tenantId ?? 'public', input.name, input.type ?? 'flash_sale', 'draft', input.startsAt ?? null, input.endsAt ?? null, JSON.stringify(input.config ?? {}), input.itemIds ?? [], input.categoryIds ?? []]);
    return { ok: true, value: this.mapCampaign(r.rows[0]!) };
  }

  async activate(campaignId: string): Promise<Result<Campaign>> {
    const r = await this.db.query<any>("UPDATE campaign SET status='active' WHERE id=$1 AND status='draft' RETURNING *", [campaignId]);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Campaign not found or not in draft' } };
    return { ok: true, value: this.mapCampaign(r.rows[0]!) };
  }

  async listByMerchant(merchantId: string): Promise<Campaign[]> {
    const r = await this.db.query<any>('SELECT * FROM campaign WHERE merchant_id=$1 ORDER BY created_at DESC', [merchantId]);
    return r.rows.map((row: any) => this.mapCampaign(row));
  }

  private mapCampaign(row: any): Campaign { return { id: row.id, merchantId: row.merchant_id, tenantId: row.tenant_id, name: row.name, type: row.type, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, config: row.config, itemIds: row.item_ids, categoryIds: row.category_ids }; }
}
