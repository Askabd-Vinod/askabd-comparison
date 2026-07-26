import { randomUUID } from 'node:crypto';
import { DbClient } from '../db/connection.js';
export type Result<T> = { ok: true; value: T } | { ok: false; error: { category: string; code: string; field?: string; message: string } };

export interface Category { id: string; tenantId: string; name: string; slug: string; parentId?: string; icon?: string; description?: string; comparisonTemplate: unknown[]; sortOrder: number; active: boolean; }
export interface Item { id: string; tenantId: string; categoryId: string; name: string; slug: string; brand?: string; description?: string; images: string[]; specifications: Record<string, unknown>; pros: string[]; cons: string[]; rating: number; reviewCount: number; priceCurrent?: number; priceOriginal?: number; priceCurrency: string; priceHistory: unknown[]; availability: string; merchant?: string; merchantUrl?: string; offers: unknown[]; warranty?: string; deliveryInfo: Record<string, unknown>; tags: string[]; status: string; createdAt: Date; }
export interface Comparison { id: string; userId: string; title?: string; categoryId?: string; itemIds: string[]; notes?: string; isPublic: boolean; shareToken?: string; createdAt: Date; }

export class CategoryService {
  constructor(private readonly db: DbClient) {}
  async create(input: { tenantId?: string; name: string; slug: string; parentId?: string; icon?: string; description?: string; comparisonTemplate?: unknown[] }): Promise<Result<Category>> {
    if (!input.name || !input.slug) return { ok: false, error: { category: 'validation', code: 'name_slug_required', message: 'name and slug required' } };
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO category (id,tenant_id,name,slug,parent_id,icon,description,comparison_template) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [id, input.tenantId ?? 'public', input.name, input.slug, input.parentId ?? null, input.icon ?? null, input.description ?? null, JSON.stringify(input.comparisonTemplate ?? [])]);
    return { ok: true, value: this.mapCat(r.rows[0]!) };
  }
  async list(tenantId?: string): Promise<Category[]> { const r = await this.db.query<any>('SELECT * FROM category WHERE (tenant_id=$1 OR tenant_id=$2) AND active=TRUE ORDER BY sort_order, name', [tenantId ?? 'public', 'public']); return r.rows.map((row: any) => this.mapCat(row)); }
  async getBySlug(slug: string, tenantId?: string): Promise<Category|null> { const r = await this.db.query<any>('SELECT * FROM category WHERE slug=$1 AND (tenant_id=$2 OR tenant_id=$3)', [slug, tenantId ?? 'public', 'public']); return r.rows[0] ? this.mapCat(r.rows[0]) : null; }
  private mapCat(row: any): Category { return { id: row.id, tenantId: row.tenant_id, name: row.name, slug: row.slug, parentId: row.parent_id, icon: row.icon, description: row.description, comparisonTemplate: row.comparison_template, sortOrder: row.sort_order, active: row.active }; }
}

export class ItemService {
  constructor(private readonly db: DbClient) {}
  async create(input: { tenantId?: string; categoryId: string; name: string; slug: string; brand?: string; description?: string; images?: string[]; specifications?: Record<string, unknown>; pros?: string[]; cons?: string[]; priceCurrent?: number; priceOriginal?: number; priceCurrency?: string; availability?: string; merchant?: string; merchantUrl?: string; offers?: unknown[]; warranty?: string; tags?: string[]; createdBy?: string }): Promise<Result<Item>> {
    if (!input.name) return { ok: false, error: { category: 'validation', code: 'name_required', field: 'name', message: 'Name required' } };
    const id = randomUUID();
    const r = await this.db.query<any>(
      `INSERT INTO item (id,tenant_id,category_id,name,slug,brand,description,images,specifications,pros,cons,price_current,price_original,price_currency,availability,merchant,merchant_url,offers,warranty,tags,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [id, input.tenantId ?? 'public', input.categoryId, input.name, input.slug ?? input.name.toLowerCase().replace(/\s+/g, '-'), input.brand ?? null, input.description ?? null, JSON.stringify(input.images ?? []), JSON.stringify(input.specifications ?? {}), input.pros ?? [], input.cons ?? [], input.priceCurrent ?? null, input.priceOriginal ?? null, input.priceCurrency ?? 'USD', input.availability ?? 'available', input.merchant ?? null, input.merchantUrl ?? null, JSON.stringify(input.offers ?? []), input.warranty ?? null, input.tags ?? [], input.createdBy ?? null]);
    return { ok: true, value: this.mapItem(r.rows[0]!) };
  }
  async getById(id: string): Promise<Item|null> { const r = await this.db.query<any>('SELECT * FROM item WHERE id=$1', [id]); return r.rows[0] ? this.mapItem(r.rows[0]) : null; }
  async getBySlug(slug: string, tenantId?: string): Promise<Item|null> { const r = await this.db.query<any>('SELECT * FROM item WHERE slug=$1 AND (tenant_id=$2 OR tenant_id=$3)', [slug, tenantId ?? 'public', 'public']); return r.rows[0] ? this.mapItem(r.rows[0]) : null; }
  async listByCategory(categoryId: string, opts?: { limit?: number; offset?: number; sort?: string }): Promise<Item[]> {
    const sort = opts?.sort === 'price' ? 'price_current' : opts?.sort === 'rating' ? 'rating DESC' : 'created_at DESC';
    const r = await this.db.query<any>(`SELECT * FROM item WHERE category_id=$1 AND status='active' ORDER BY ${sort} LIMIT $2 OFFSET $3`, [categoryId, opts?.limit ?? 20, opts?.offset ?? 0]);
    return r.rows.map((row: any) => this.mapItem(row));
  }
  async compare(itemIds: string[]): Promise<Item[]> {
    if (itemIds.length === 0) return [];
    const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(',');
    const r = await this.db.query<any>(`SELECT * FROM item WHERE id IN (${placeholders})`, itemIds);
    return r.rows.map((row: any) => this.mapItem(row));
  }
  async search(query: string, tenantId?: string): Promise<Item[]> {
    const r = await this.db.query<any>(`SELECT * FROM item WHERE (tenant_id=$1 OR tenant_id='public') AND status='active' AND (name ILIKE $2 OR brand ILIKE $2 OR $3=ANY(tags)) ORDER BY rating DESC LIMIT 20`, [tenantId ?? 'public', `%${query}%`, query]);
    return r.rows.map((row: any) => this.mapItem(row));
  }
  private mapItem(row: any): Item { return { id: row.id, tenantId: row.tenant_id, categoryId: row.category_id, name: row.name, slug: row.slug, brand: row.brand, description: row.description, images: row.images, specifications: row.specifications, pros: row.pros, cons: row.cons, rating: Number(row.rating), reviewCount: row.review_count, priceCurrent: row.price_current ? Number(row.price_current) : undefined, priceOriginal: row.price_original ? Number(row.price_original) : undefined, priceCurrency: row.price_currency, priceHistory: row.price_history, availability: row.availability, merchant: row.merchant, merchantUrl: row.merchant_url, offers: row.offers, warranty: row.warranty, deliveryInfo: row.delivery_info, tags: row.tags, status: row.status, createdAt: row.created_at }; }
}

export class ComparisonService {
  constructor(private readonly db: DbClient) {}
  async create(input: { userId: string; title?: string; categoryId?: string; itemIds: string[]; notes?: string; isPublic?: boolean }): Promise<Result<Comparison>> {
    if (!input.userId) return { ok: false, error: { category: 'validation', code: 'user_required', message: 'userId required' } };
    if (input.itemIds.length < 2) return { ok: false, error: { category: 'validation', code: 'min_items', message: 'At least 2 items required for comparison' } };
    const id = randomUUID();
    const shareToken = input.isPublic ? randomUUID().substring(0, 12) : null;
    const r = await this.db.query<any>('INSERT INTO comparison (id,user_id,title,category_id,item_ids,notes,is_public,share_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [id, input.userId, input.title ?? null, input.categoryId ?? null, input.itemIds, input.notes ?? null, input.isPublic ?? false, shareToken]);
    return { ok: true, value: this.mapComp(r.rows[0]!) };
  }
  async listByUser(userId: string): Promise<Comparison[]> { const r = await this.db.query<any>('SELECT * FROM comparison WHERE user_id=$1 ORDER BY created_at DESC', [userId]); return r.rows.map((row: any) => this.mapComp(row)); }
  async getByShareToken(token: string): Promise<Comparison|null> { const r = await this.db.query<any>('SELECT * FROM comparison WHERE share_token=$1 AND is_public=TRUE', [token]); return r.rows[0] ? this.mapComp(r.rows[0]) : null; }
  private mapComp(row: any): Comparison { return { id: row.id, userId: row.user_id, title: row.title, categoryId: row.category_id, itemIds: row.item_ids, notes: row.notes, isPublic: row.is_public, shareToken: row.share_token, createdAt: row.created_at }; }
}
