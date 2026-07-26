import { randomUUID } from 'node:crypto';
import { DbClient } from '../db/connection.js';
import { type Result } from './comparison-engine.js';

/**
 * Price Engine
 * Multi-merchant pricing, historical tracking, offers, availability.
 * Integrates with: Financial Platform, Notification Platform, Analytics Platform.
 */

export interface PriceEntry { id: string; itemId: string; variantId?: string; merchantId?: string; price: number; originalPrice?: number; currency: string; sourceUrl?: string; isAffiliate: boolean; validFrom: Date; validUntil?: Date; recordedAt: Date; }
export interface Offer { id: string; itemId?: string; merchantId?: string; type: string; title: string; description?: string; code?: string; discountValue?: number; discountType?: string; validFrom: Date; validUntil?: Date; terms?: string; url?: string; status: string; priority: number; }

export class PriceEngine {
  constructor(private readonly db: DbClient) {}

  async recordPrice(input: { itemId: string; variantId?: string; merchantId?: string; price: number; originalPrice?: number; currency?: string; sourceUrl?: string; isAffiliate?: boolean; validUntil?: Date }): Promise<Result<PriceEntry>> {
    if (!input.itemId || !input.price) return { ok: false, error: { category: 'validation', code: 'item_price_required', message: 'itemId and price required' } };
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO item_price (id,item_id,variant_id,merchant_id,price,original_price,currency,source_url,is_affiliate,valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [id, input.itemId, input.variantId ?? null, input.merchantId ?? null, input.price, input.originalPrice ?? null, input.currency ?? 'USD', input.sourceUrl ?? null, input.isAffiliate ?? false, input.validUntil ?? null]);
    const row = r.rows[0]!;
    return { ok: true, value: { id: row.id, itemId: row.item_id, variantId: row.variant_id, merchantId: row.merchant_id, price: Number(row.price), originalPrice: row.original_price ? Number(row.original_price) : undefined, currency: row.currency, sourceUrl: row.source_url, isAffiliate: row.is_affiliate, validFrom: row.valid_from, validUntil: row.valid_until, recordedAt: row.recorded_at } };
  }

  async getPriceHistory(itemId: string, opts?: { merchantId?: string; limit?: number }): Promise<PriceEntry[]> {
    let sql = 'SELECT * FROM item_price WHERE item_id=$1'; const params: unknown[] = [itemId]; let idx = 2;
    if (opts?.merchantId) { sql += ` AND merchant_id=$${idx++}`; params.push(opts.merchantId); }
    sql += ` ORDER BY recorded_at DESC LIMIT $${idx}`; params.push(opts?.limit ?? 30);
    const r = await this.db.query<any>(sql, params);
    return r.rows.map((row: any) => ({ id: row.id, itemId: row.item_id, variantId: row.variant_id, merchantId: row.merchant_id, price: Number(row.price), originalPrice: row.original_price ? Number(row.original_price) : undefined, currency: row.currency, sourceUrl: row.source_url, isAffiliate: row.is_affiliate, validFrom: row.valid_from, validUntil: row.valid_until, recordedAt: row.recorded_at }));
  }

  async getLowestPrice(itemId: string): Promise<PriceEntry | null> {
    const r = await this.db.query<any>('SELECT * FROM item_price WHERE item_id=$1 AND (valid_until IS NULL OR valid_until > NOW()) ORDER BY price ASC LIMIT 1', [itemId]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0]!;
    return { id: row.id, itemId: row.item_id, variantId: row.variant_id, merchantId: row.merchant_id, price: Number(row.price), originalPrice: row.original_price ? Number(row.original_price) : undefined, currency: row.currency, sourceUrl: row.source_url, isAffiliate: row.is_affiliate, validFrom: row.valid_from, validUntil: row.valid_until, recordedAt: row.recorded_at };
  }

  async getMerchantPrices(itemId: string): Promise<PriceEntry[]> {
    const r = await this.db.query<any>('SELECT DISTINCT ON (merchant_id) * FROM item_price WHERE item_id=$1 AND merchant_id IS NOT NULL ORDER BY merchant_id, recorded_at DESC', [itemId]);
    return r.rows.map((row: any) => ({ id: row.id, itemId: row.item_id, variantId: row.variant_id, merchantId: row.merchant_id, price: Number(row.price), originalPrice: row.original_price ? Number(row.original_price) : undefined, currency: row.currency, sourceUrl: row.source_url, isAffiliate: row.is_affiliate, validFrom: row.valid_from, validUntil: row.valid_until, recordedAt: row.recorded_at }));
  }

  // === Offers ===
  async createOffer(input: { itemId?: string; merchantId?: string; type: string; title: string; description?: string; code?: string; discountValue?: number; discountType?: string; validFrom?: Date; validUntil?: Date; terms?: string; url?: string; priority?: number }): Promise<Result<Offer>> {
    if (!input.title) return { ok: false, error: { category: 'validation', code: 'title_required', field: 'title', message: 'Title required' } };
    const id = randomUUID();
    const r = await this.db.query<any>(
      'INSERT INTO offer (id,item_id,merchant_id,type,title,description,code,discount_value,discount_type,valid_from,valid_until,terms,url,priority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
      [id, input.itemId ?? null, input.merchantId ?? null, input.type ?? 'discount', input.title, input.description ?? null, input.code ?? null, input.discountValue ?? null, input.discountType ?? null, input.validFrom ?? new Date(), input.validUntil ?? null, input.terms ?? null, input.url ?? null, input.priority ?? 0]);
    return { ok: true, value: this.mapOffer(r.rows[0]!) };
  }

  async getActiveOffers(itemId: string): Promise<Offer[]> {
    const r = await this.db.query<any>("SELECT * FROM offer WHERE item_id=$1 AND status='active' AND (valid_until IS NULL OR valid_until > NOW()) ORDER BY priority DESC", [itemId]);
    return r.rows.map((row: any) => this.mapOffer(row));
  }

  async getTrendingDeals(limit?: number): Promise<Offer[]> {
    const r = await this.db.query<any>("SELECT * FROM offer WHERE status='active' AND (valid_until IS NULL OR valid_until > NOW()) ORDER BY priority DESC, created_at DESC LIMIT $1", [limit ?? 20]);
    return r.rows.map((row: any) => this.mapOffer(row));
  }

  private mapOffer(row: any): Offer {
    return { id: row.id, itemId: row.item_id, merchantId: row.merchant_id, type: row.type, title: row.title, description: row.description, code: row.code, discountValue: row.discount_value ? Number(row.discount_value) : undefined, discountType: row.discount_type, validFrom: row.valid_from, validUntil: row.valid_until, terms: row.terms, url: row.url, status: row.status, priority: row.priority };
  }
}
