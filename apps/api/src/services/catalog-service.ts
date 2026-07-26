import { randomUUID } from 'node:crypto';
import { DbClient } from '../db/connection.js';
import { type Result } from './comparison-engine.js';

/**
 * Universal Product Catalog Service
 * Domain-agnostic: supports electronics, travel, insurance, education, etc.
 * All domain-specific data lives in specifications (JSONB) + comparison attributes.
 */

export interface CatalogItem {
  id: string; tenantId: string; categoryId: string; brandId?: string; merchantId?: string;
  name: string; slug: string; description?: string;
  specifications: Record<string, unknown>; pros: string[]; cons: string[];
  rating: number; reviewCount: number;
  priceCurrent?: number; priceOriginal?: number; priceCurrency: string;
  availability: string; tags: string[]; status: string;
  source: string; locale: string;
  publishedAt?: Date; createdAt: Date; updatedAt: Date;
}

export interface ItemMedia { id: string; itemId: string; type: string; url: string; thumbnailUrl?: string; altText?: string; caption?: string; sortOrder: number; isPrimary: boolean; }
export interface ItemRelation { id: string; itemId: string; relatedItemId: string; relationType: string; sortOrder: number; }

export class CatalogService {
  constructor(private readonly db: DbClient) {}

  async createItem(input: { tenantId?: string; categoryId: string; brandId?: string; merchantId?: string; name: string; slug: string; description?: string; specifications?: Record<string, unknown>; pros?: string[]; cons?: string[]; priceCurrent?: number; priceOriginal?: number; priceCurrency?: string; availability?: string; tags?: string[]; source?: string; locale?: string }): Promise<Result<CatalogItem>> {
    if (!input.name) return { ok: false, error: { category: 'validation', code: 'name_required', field: 'name', message: 'Name required' } };
    if (!input.categoryId) return { ok: false, error: { category: 'validation', code: 'category_required', field: 'categoryId', message: 'categoryId required' } };
    const id = randomUUID(); const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const r = await this.db.query<any>(
      `INSERT INTO item (id,tenant_id,category_id,brand_id,merchant_id,name,slug,description,specifications,pros,cons,price_current,price_original,price_currency,availability,tags,source,locale,status,published_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'active',NOW()) RETURNING *`,
      [id, input.tenantId ?? 'public', input.categoryId, input.brandId ?? null, input.merchantId ?? null, input.name, slug, input.description ?? null, JSON.stringify(input.specifications ?? {}), input.pros ?? [], input.cons ?? [], input.priceCurrent ?? null, input.priceOriginal ?? null, input.priceCurrency ?? 'USD', input.availability ?? 'available', input.tags ?? [], input.source ?? 'manual', input.locale ?? 'en']);
    return { ok: true, value: this.mapItem(r.rows[0]!) };
  }

  async updateItem(id: string, updates: Partial<{ name: string; description: string; specifications: Record<string, unknown>; pros: string[]; cons: string[]; priceCurrent: number; priceOriginal: number; availability: string; tags: string[]; status: string }>): Promise<Result<CatalogItem>> {
    const sets: string[] = []; const params: unknown[] = []; let idx = 1;
    if (updates.name) { sets.push(`name=$${idx++}`); params.push(updates.name); }
    if (updates.description !== undefined) { sets.push(`description=$${idx++}`); params.push(updates.description); }
    if (updates.specifications) { sets.push(`specifications=$${idx++}`); params.push(JSON.stringify(updates.specifications)); }
    if (updates.pros) { sets.push(`pros=$${idx++}`); params.push(updates.pros); }
    if (updates.cons) { sets.push(`cons=$${idx++}`); params.push(updates.cons); }
    if (updates.priceCurrent !== undefined) { sets.push(`price_current=$${idx++}`); params.push(updates.priceCurrent); }
    if (updates.priceOriginal !== undefined) { sets.push(`price_original=$${idx++}`); params.push(updates.priceOriginal); }
    if (updates.availability) { sets.push(`availability=$${idx++}`); params.push(updates.availability); }
    if (updates.tags) { sets.push(`tags=$${idx++}`); params.push(updates.tags); }
    if (updates.status) { sets.push(`status=$${idx++}`); params.push(updates.status); }
    if (sets.length === 0) return { ok: false, error: { category: 'validation', code: 'no_updates', message: 'Nothing to update' } };
    sets.push(`updated_at=NOW()`);
    params.push(id);
    const r = await this.db.query<any>(`UPDATE item SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, params);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Item not found' } };
    return { ok: true, value: this.mapItem(r.rows[0]!) };
  }

  async addMedia(input: { itemId: string; type: string; url: string; thumbnailUrl?: string; altText?: string; caption?: string; sortOrder?: number; isPrimary?: boolean }): Promise<Result<ItemMedia>> {
    if (!input.url) return { ok: false, error: { category: 'validation', code: 'url_required', field: 'url', message: 'URL required' } };
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO item_media (id,item_id,type,url,thumbnail_url,alt_text,caption,sort_order,is_primary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [id, input.itemId, input.type ?? 'image', input.url, input.thumbnailUrl ?? null, input.altText ?? null, input.caption ?? null, input.sortOrder ?? 0, input.isPrimary ?? false]);
    const row = r.rows[0]!;
    return { ok: true, value: { id: row.id, itemId: row.item_id, type: row.type, url: row.url, thumbnailUrl: row.thumbnail_url, altText: row.alt_text, caption: row.caption, sortOrder: row.sort_order, isPrimary: row.is_primary } };
  }

  async getMedia(itemId: string): Promise<ItemMedia[]> {
    const r = await this.db.query<any>('SELECT * FROM item_media WHERE item_id=$1 ORDER BY sort_order', [itemId]);
    return r.rows.map((row: any) => ({ id: row.id, itemId: row.item_id, type: row.type, url: row.url, thumbnailUrl: row.thumbnail_url, altText: row.alt_text, caption: row.caption, sortOrder: row.sort_order, isPrimary: row.is_primary }));
  }

  async addRelation(input: { itemId: string; relatedItemId: string; relationType?: string }): Promise<Result<ItemRelation>> {
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO item_relation (id,item_id,related_item_id,relation_type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *',
      [id, input.itemId, input.relatedItemId, input.relationType ?? 'similar']);
    if (r.rows.length === 0) return { ok: false, error: { category: 'conflict', code: 'relation_exists', message: 'Relation already exists' } };
    const row = r.rows[0]!;
    return { ok: true, value: { id: row.id, itemId: row.item_id, relatedItemId: row.related_item_id, relationType: row.relation_type, sortOrder: row.sort_order } };
  }

  async getRelated(itemId: string, type?: string): Promise<CatalogItem[]> {
    const sql = type
      ? 'SELECT i.* FROM item i JOIN item_relation r ON r.related_item_id=i.id WHERE r.item_id=$1 AND r.relation_type=$2 ORDER BY r.sort_order'
      : 'SELECT i.* FROM item i JOIN item_relation r ON r.related_item_id=i.id WHERE r.item_id=$1 ORDER BY r.sort_order';
    const params = type ? [itemId, type] : [itemId];
    const r = await this.db.query<any>(sql, params);
    return r.rows.map((row: any) => this.mapItem(row));
  }

  async bulkImport(items: Parameters<CatalogService['createItem']>[0][]): Promise<Result<{ imported: number; errors: number }>> {
    let imported = 0; let errors = 0;
    for (const item of items) { const r = await this.createItem(item); if (r.ok) imported++; else errors++; }
    return { ok: true, value: { imported, errors } };
  }

  private mapItem(row: any): CatalogItem {
    return { id: row.id, tenantId: row.tenant_id, categoryId: row.category_id, brandId: row.brand_id, merchantId: row.merchant_id, name: row.name, slug: row.slug, description: row.description, specifications: row.specifications ?? {}, pros: row.pros ?? [], cons: row.cons ?? [], rating: Number(row.rating ?? 0), reviewCount: row.review_count ?? 0, priceCurrent: row.price_current ? Number(row.price_current) : undefined, priceOriginal: row.price_original ? Number(row.price_original) : undefined, priceCurrency: row.price_currency ?? 'USD', availability: row.availability ?? 'available', tags: row.tags ?? [], status: row.status, source: row.source ?? 'manual', locale: row.locale ?? 'en', publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
