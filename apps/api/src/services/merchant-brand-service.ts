import { randomUUID } from 'node:crypto';
import { DbClient } from '../db/connection.js';
import { type Result } from './comparison-engine.js';

export type MerchantStatus = 'pending' | 'active' | 'suspended';
export type VerificationLevel = 'basic' | 'verified' | 'premium' | 'enterprise';
export type VerificationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired';

export interface Brand { id: string; name: string; slug: string; logoUrl?: string; description?: string; website?: string; manufacturer?: string; aliases: string[]; socialLinks: Record<string, unknown>; categories: string[]; verified: boolean; status: string; media: unknown[]; createdAt: Date; }
export interface Merchant { id: string; tenantId: string; name: string; slug: string; logoUrl?: string; website?: string; description?: string; registrationNumber?: string; businessType?: string; trustScore: number; commissionRate: number; verified: boolean; status: MerchantStatus; certifications: string[]; tags: string[]; socialLinks: Record<string, unknown>; policies: Record<string, unknown>; createdAt: Date; }
export interface MerchantVerification { id: string; merchantId: string; level: VerificationLevel; status: VerificationStatus; documents: unknown[]; reviewerId?: string; notes?: string; expiresAt?: Date; createdAt: Date; }
export interface MerchantBranch { id: string; merchantId: string; name: string; city?: string; country: string; isHeadquarters: boolean; status: string; }

export class BrandService {
  constructor(private readonly db: DbClient) {}

  async create(input: { name: string; slug: string; logoUrl?: string; description?: string; website?: string; manufacturer?: string; aliases?: string[]; socialLinks?: Record<string, unknown> }): Promise<Result<Brand>> {
    if (!input.name || !input.slug) return { ok: false, error: { category: 'validation', code: 'name_slug_required', message: 'name and slug required' } };
    const existing = await this.db.query<{ id: string }>('SELECT id FROM brand WHERE slug=$1', [input.slug]);
    if (existing.rows.length > 0) return { ok: false, error: { category: 'conflict', code: 'slug_exists', message: 'Brand with this slug exists' } };
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO brand (id,name,slug,logo_url,description,website,manufacturer,aliases,social_links) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [id, input.name, input.slug, input.logoUrl ?? null, input.description ?? null, input.website ?? null, input.manufacturer ?? null, input.aliases ?? [], JSON.stringify(input.socialLinks ?? {})]);
    return { ok: true, value: this.mapBrand(r.rows[0]!) };
  }

  async update(id: string, updates: Partial<{ name: string; logoUrl: string; description: string; website: string; manufacturer: string; aliases: string[]; socialLinks: Record<string, unknown> }>): Promise<Result<Brand>> {
    const sets: string[] = []; const params: unknown[] = []; let idx = 1;
    if (updates.name) { sets.push(`name=$${idx++}`); params.push(updates.name); }
    if (updates.logoUrl !== undefined) { sets.push(`logo_url=$${idx++}`); params.push(updates.logoUrl); }
    if (updates.description !== undefined) { sets.push(`description=$${idx++}`); params.push(updates.description); }
    if (updates.website !== undefined) { sets.push(`website=$${idx++}`); params.push(updates.website); }
    if (updates.manufacturer !== undefined) { sets.push(`manufacturer=$${idx++}`); params.push(updates.manufacturer); }
    if (updates.aliases) { sets.push(`aliases=$${idx++}`); params.push(updates.aliases); }
    if (updates.socialLinks) { sets.push(`social_links=$${idx++}`); params.push(JSON.stringify(updates.socialLinks)); }
    if (sets.length === 0) return { ok: false, error: { category: 'validation', code: 'no_updates', message: 'No fields to update' } };
    params.push(id);
    const r = await this.db.query<any>(`UPDATE brand SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, params);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Brand not found' } };
    return { ok: true, value: this.mapBrand(r.rows[0]!) };
  }

  async archive(id: string): Promise<Result<void>> { await this.db.query("UPDATE brand SET status='archived' WHERE id=$1", [id]); return { ok: true, value: undefined }; }
  async restore(id: string): Promise<Result<void>> { await this.db.query("UPDATE brand SET status='active' WHERE id=$1", [id]); return { ok: true, value: undefined }; }

  async getById(id: string): Promise<Brand | null> { const r = await this.db.query<any>('SELECT * FROM brand WHERE id=$1', [id]); return r.rows[0] ? this.mapBrand(r.rows[0]) : null; }
  async getBySlug(slug: string): Promise<Brand | null> { const r = await this.db.query<any>('SELECT * FROM brand WHERE slug=$1', [slug]); return r.rows[0] ? this.mapBrand(r.rows[0]) : null; }
  async list(opts?: { status?: string; limit?: number; offset?: number }): Promise<Brand[]> {
    let sql = 'SELECT * FROM brand WHERE 1=1'; const params: unknown[] = []; let idx = 1;
    if (opts?.status) { sql += ` AND status=$${idx++}`; params.push(opts.status); }
    sql += ` ORDER BY name LIMIT $${idx++} OFFSET $${idx}`; params.push(opts?.limit ?? 50); params.push(opts?.offset ?? 0);
    const r = await this.db.query<any>(sql, params); return r.rows.map((row: any) => this.mapBrand(row));
  }
  async search(query: string): Promise<Brand[]> { const r = await this.db.query<any>('SELECT * FROM brand WHERE name ILIKE $1 OR $2=ANY(aliases) ORDER BY name LIMIT 20', [`%${query}%`, query]); return r.rows.map((row: any) => this.mapBrand(row)); }

  private mapBrand(row: any): Brand { return { id: row.id, name: row.name, slug: row.slug, logoUrl: row.logo_url, description: row.description, website: row.website, manufacturer: row.manufacturer, aliases: row.aliases ?? [], socialLinks: row.social_links ?? {}, categories: row.categories ?? [], verified: row.verified, status: row.status ?? 'active', media: row.media ?? [], createdAt: row.created_at }; }
}

export class MerchantService {
  constructor(private readonly db: DbClient) {}

  async register(input: { tenantId?: string; name: string; slug: string; logoUrl?: string; website?: string; description?: string; registrationNumber?: string; businessType?: string; tags?: string[]; certifications?: string[] }): Promise<Result<Merchant>> {
    if (!input.name || !input.slug) return { ok: false, error: { category: 'validation', code: 'name_slug_required', message: 'name and slug required' } };
    const id = randomUUID();
    const r = await this.db.query<any>(
      'INSERT INTO merchant (id,tenant_id,name,slug,logo_url,website,description,registration_number,business_type,tags,certifications,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
      [id, input.tenantId ?? 'public', input.name, input.slug, input.logoUrl ?? null, input.website ?? null, input.description ?? null, input.registrationNumber ?? null, input.businessType ?? null, input.tags ?? [], input.certifications ?? [], 'pending']);
    return { ok: true, value: this.mapMerchant(r.rows[0]!) };
  }

  async approve(merchantId: string): Promise<Result<Merchant>> {
    const r = await this.db.query<any>("UPDATE merchant SET status='active', verified=TRUE, updated_at=NOW() WHERE id=$1 RETURNING *", [merchantId]);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Merchant not found' } };
    return { ok: true, value: this.mapMerchant(r.rows[0]!) };
  }

  async suspend(merchantId: string): Promise<Result<Merchant>> {
    const r = await this.db.query<any>("UPDATE merchant SET status='suspended', updated_at=NOW() WHERE id=$1 RETURNING *", [merchantId]);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Merchant not found' } };
    return { ok: true, value: this.mapMerchant(r.rows[0]!) };
  }

  async reactivate(merchantId: string): Promise<Result<Merchant>> {
    const r = await this.db.query<any>("UPDATE merchant SET status='active', updated_at=NOW() WHERE id=$1 RETURNING *", [merchantId]);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Merchant not found' } };
    return { ok: true, value: this.mapMerchant(r.rows[0]!) };
  }

  async submitVerification(input: { merchantId: string; level: VerificationLevel; documents?: unknown[] }): Promise<Result<MerchantVerification>> {
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO merchant_verification (id,merchant_id,level,status,documents) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, input.merchantId, input.level, 'pending', JSON.stringify(input.documents ?? [])]);
    return { ok: true, value: this.mapVerification(r.rows[0]!) };
  }

  async reviewVerification(verificationId: string, decision: 'approved' | 'rejected', reviewerId: string, notes?: string): Promise<Result<MerchantVerification>> {
    const r = await this.db.query<any>('UPDATE merchant_verification SET status=$1, reviewer_id=$2, reviewed_at=NOW(), notes=$3 WHERE id=$4 RETURNING *',
      [decision, reviewerId, notes ?? null, verificationId]);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Verification not found' } };
    return { ok: true, value: this.mapVerification(r.rows[0]!) };
  }

  async addBranch(input: { merchantId: string; name: string; city?: string; country: string; isHeadquarters?: boolean }): Promise<Result<MerchantBranch>> {
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO merchant_branch (id,merchant_id,name,city,country,is_headquarters) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, input.merchantId, input.name, input.city ?? null, input.country, input.isHeadquarters ?? false]);
    return { ok: true, value: { id: r.rows[0]!.id, merchantId: r.rows[0]!.merchant_id, name: r.rows[0]!.name, city: r.rows[0]!.city, country: r.rows[0]!.country, isHeadquarters: r.rows[0]!.is_headquarters, status: r.rows[0]!.status } };
  }

  async getById(id: string): Promise<Merchant | null> { const r = await this.db.query<any>('SELECT * FROM merchant WHERE id=$1', [id]); return r.rows[0] ? this.mapMerchant(r.rows[0]) : null; }
  async list(opts?: { status?: MerchantStatus; tenantId?: string; limit?: number; offset?: number }): Promise<Merchant[]> {
    let sql = 'SELECT * FROM merchant WHERE 1=1'; const params: unknown[] = []; let idx = 1;
    if (opts?.status) { sql += ` AND status=$${idx++}`; params.push(opts.status); }
    if (opts?.tenantId) { sql += ` AND tenant_id=$${idx++}`; params.push(opts.tenantId); }
    sql += ` ORDER BY name LIMIT $${idx++} OFFSET $${idx}`; params.push(opts?.limit ?? 50); params.push(opts?.offset ?? 0);
    const r = await this.db.query<any>(sql, params); return r.rows.map((row: any) => this.mapMerchant(row));
  }
  async search(query: string): Promise<Merchant[]> { const r = await this.db.query<any>('SELECT * FROM merchant WHERE name ILIKE $1 OR $2=ANY(tags) ORDER BY trust_score DESC LIMIT 20', [`%${query}%`, query]); return r.rows.map((row: any) => this.mapMerchant(row)); }

  private mapMerchant(row: any): Merchant { return { id: row.id, tenantId: row.tenant_id, name: row.name, slug: row.slug, logoUrl: row.logo_url, website: row.website, description: row.description, registrationNumber: row.registration_number, businessType: row.business_type, trustScore: Number(row.trust_score ?? 0), commissionRate: Number(row.commission_rate ?? 0), verified: row.verified, status: row.status, certifications: row.certifications ?? [], tags: row.tags ?? [], socialLinks: row.social_links ?? {}, policies: row.policies ?? {}, createdAt: row.created_at }; }
  private mapVerification(row: any): MerchantVerification { return { id: row.id, merchantId: row.merchant_id, level: row.level, status: row.status, documents: row.documents, reviewerId: row.reviewer_id, notes: row.notes, expiresAt: row.expires_at, createdAt: row.created_at }; }
}
