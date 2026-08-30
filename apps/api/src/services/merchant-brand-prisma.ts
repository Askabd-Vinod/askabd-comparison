import { PrismaClient } from '@prisma/client';

import { type Result } from './types.js';
export type MerchantStatus = 'pending' | 'active' | 'suspended';
export type VerificationLevel = 'basic' | 'verified' | 'premium' | 'enterprise';
export type VerificationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired';

export interface Brand { id: string; name: string; slug: string; logoUrl?: string; description?: string; website?: string; manufacturer?: string; aliases: string[]; socialLinks: Record<string, unknown>; categories: string[]; verified: boolean; status: string; media: unknown[]; createdAt: Date; }
export interface Merchant { id: string; tenantId: string; name: string; slug: string; logoUrl?: string; website?: string; description?: string; registrationNumber?: string; businessType?: string; trustScore: number; commissionRate: number; verified: boolean; status: MerchantStatus; certifications: string[]; tags: string[]; socialLinks: Record<string, unknown>; policies: Record<string, unknown>; createdAt: Date; }
export interface MerchantVerification { id: string; merchantId: string; level: VerificationLevel; status: VerificationStatus; documents: unknown[]; reviewerId?: string; notes?: string; expiresAt?: Date; createdAt: Date; }
export interface MerchantBranch { id: string; merchantId: string; name: string; city?: string; country: string; isHeadquarters: boolean; status: string; }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BrandService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { name: string; slug: string; logoUrl?: string; description?: string; website?: string; manufacturer?: string; aliases?: string[]; socialLinks?: Record<string, unknown> }): Promise<Result<Brand>> {
    if (!input.name || !input.slug) return { ok: false, error: { category: 'validation', code: 'name_slug_required', message: 'name and slug required', statusCode: 400 } };
    try {
      const row = await this.prisma.brand.create({
        data: { name: input.name, slug: input.slug, logo_url: input.logoUrl ?? null, description: input.description ?? null, website: input.website ?? null, manufacturer: input.manufacturer ?? null, aliases: input.aliases ?? [], social_links: (input.socialLinks ?? {}) as any },
      });
      return { ok: true, value: this.mapBrand(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2002') {
        return { ok: false, error: { category: 'conflict', code: 'slug_exists', message: 'Brand with this slug exists', statusCode: 409 } };
      }
      throw e;
    }
  }

  async update(id: string, updates: Partial<{ name: string; logoUrl: string; description: string; website: string; manufacturer: string; aliases: string[]; socialLinks: Record<string, unknown> }>): Promise<Result<Brand>> {
    if (Object.keys(updates).length === 0) return { ok: false, error: { category: 'validation', code: 'no_updates', message: 'No fields to update', statusCode: 400 } };
    try {
      const data: any = {};
      if (updates.name) data.name = updates.name;
      if (updates.logoUrl !== undefined) data.logo_url = updates.logoUrl;
      if (updates.description !== undefined) data.description = updates.description;
      if (updates.website !== undefined) data.website = updates.website;
      if (updates.manufacturer !== undefined) data.manufacturer = updates.manufacturer;
      if (updates.aliases) data.aliases = updates.aliases;
      if (updates.socialLinks) data.social_links = updates.socialLinks;
      const row = await this.prisma.brand.update({ where: { id }, data });
      return { ok: true, value: this.mapBrand(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Brand not found', statusCode: 404 } };
      throw e;
    }
  }

  async archive(id: string): Promise<Result<void>> { await this.prisma.brand.update({ where: { id }, data: { status: 'archived' } }); return { ok: true, value: undefined }; }
  async restore(id: string): Promise<Result<void>> { await this.prisma.brand.update({ where: { id }, data: { status: 'active' } }); return { ok: true, value: undefined }; }
  async getById(id: string): Promise<Brand | null> { const r = await this.prisma.brand.findUnique({ where: { id } }); return r ? this.mapBrand(r) : null; }
  async getBySlug(slug: string): Promise<Brand | null> { const r = await this.prisma.brand.findUnique({ where: { slug } }); return r ? this.mapBrand(r) : null; }

  async list(opts?: { status?: string; limit?: number; offset?: number }): Promise<Brand[]> {
    const rows = await this.prisma.brand.findMany({
      where: opts?.status ? { status: opts.status } : undefined,
      orderBy: { name: 'asc' },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows.map(r => this.mapBrand(r));
  }

  async search(query: string): Promise<Brand[]> {
    const rows = await this.prisma.brand.findMany({
      where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { aliases: { has: query } }] },
      orderBy: { name: 'asc' },
      take: 20,
    });
    return rows.map(r => this.mapBrand(r));
  }

  private mapBrand(row: any): Brand { return { id: row.id, name: row.name, slug: row.slug, logoUrl: row.logo_url ?? undefined, description: row.description ?? undefined, website: row.website ?? undefined, manufacturer: row.manufacturer ?? undefined, aliases: row.aliases ?? [], socialLinks: (row.social_links as Record<string, unknown>) ?? {}, categories: row.categories ?? [], verified: row.verified, status: row.status ?? 'active', media: (row.media as unknown[]) ?? [], createdAt: row.created_at }; }
}

export class MerchantService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: { tenantId?: string; name: string; slug: string; logoUrl?: string; website?: string; description?: string; registrationNumber?: string; businessType?: string; tags?: string[]; certifications?: string[] }): Promise<Result<Merchant>> {
    if (!input.name || !input.slug) return { ok: false, error: { category: 'validation', code: 'name_slug_required', message: 'name and slug required', statusCode: 400 } };
    try {
      const row = await this.prisma.merchant.create({
        data: { tenant_id: input.tenantId ?? 'public', name: input.name, slug: input.slug, logo_url: input.logoUrl ?? null, website: input.website ?? null, description: input.description ?? null, registration_number: input.registrationNumber ?? null, business_type: input.businessType ?? null, tags: input.tags ?? [], certifications: input.certifications ?? [], status: 'pending' },
      });
      return { ok: true, value: this.mapMerchant(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2002') return { ok: false, error: { category: 'conflict', code: 'slug_exists', message: 'Merchant with this slug exists', statusCode: 409 } };
      throw e;
    }
  }

  async approve(merchantId: string): Promise<Result<Merchant>> {
    try {
      const row = await this.prisma.merchant.update({ where: { id: merchantId }, data: { status: 'active', verified: true, updated_at: new Date() } });
      return { ok: true, value: this.mapMerchant(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Merchant not found', statusCode: 404 } };
      throw e;
    }
  }

  async suspend(merchantId: string): Promise<Result<Merchant>> {
    try {
      const row = await this.prisma.merchant.update({ where: { id: merchantId }, data: { status: 'suspended', updated_at: new Date() } });
      return { ok: true, value: this.mapMerchant(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Merchant not found', statusCode: 404 } };
      throw e;
    }
  }

  async reactivate(merchantId: string): Promise<Result<Merchant>> {
    try {
      const row = await this.prisma.merchant.update({ where: { id: merchantId }, data: { status: 'active', updated_at: new Date() } });
      return { ok: true, value: this.mapMerchant(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Merchant not found', statusCode: 404 } };
      throw e;
    }
  }

  async submitVerification(input: { merchantId: string; level: VerificationLevel; documents?: unknown[] }): Promise<Result<MerchantVerification>> {
    // Real bug found and fixed (Batch 4 Playwright coverage completion,
    // 2026-08-30): `merchant_id` is a real Postgres `@db.Uuid` column
    // with no validation here — a malformed (non-UUID) `:id` in the URL
    // reached the database uncaught, producing a genuine 500 ("Database
    // operation failed" — safely sanitized, but the wrong status code:
    // this is a real client input error, not a server infrastructure
    // failure). Reproduced live via `POST /merchants/not-a-real-uuid
    // /verification`. Fixed with an explicit, real UUID-format check
    // before the database call, matching this file's own existing
    // validation style (e.g. `name_slug_required`).
    if (!UUID_RE.test(input.merchantId)) return { ok: false, error: { category: 'validation', code: 'invalid_merchant_id', field: 'merchantId', message: 'merchantId must be a valid UUID', statusCode: 400 } };
    const row = await this.prisma.merchant_verification.create({
      data: { merchant_id: input.merchantId, level: input.level, status: 'pending', documents: (input.documents ?? []) as any },
    });
    return { ok: true, value: this.mapVerification(row) };
  }

  async reviewVerification(verificationId: string, decision: 'approved' | 'rejected', reviewerId: string, notes?: string): Promise<Result<MerchantVerification>> {
    try {
      const row = await this.prisma.merchant_verification.update({
        where: { id: verificationId },
        data: { status: decision, reviewer_id: reviewerId, reviewed_at: new Date(), notes: notes ?? null },
      });
      return { ok: true, value: this.mapVerification(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Verification not found', statusCode: 404 } };
      throw e;
    }
  }

  async addBranch(input: { merchantId: string; name: string; city?: string; country: string; isHeadquarters?: boolean }): Promise<Result<MerchantBranch>> {
    // Same real defect class as submitVerification above, found by
    // inspecting every write path in this file after reproducing the
    // one live — fixed the same way.
    if (!UUID_RE.test(input.merchantId)) return { ok: false, error: { category: 'validation', code: 'invalid_merchant_id', field: 'merchantId', message: 'merchantId must be a valid UUID', statusCode: 400 } };
    const row = await this.prisma.merchant_branch.create({
      data: { merchant_id: input.merchantId, name: input.name, city: input.city ?? null, country: input.country, is_headquarters: input.isHeadquarters ?? false },
    });
    return { ok: true, value: { id: row.id, merchantId: row.merchant_id, name: row.name, city: row.city ?? undefined, country: row.country, isHeadquarters: row.is_headquarters ?? false, status: row.status ?? 'active' } };
  }

  async getById(id: string): Promise<Merchant | null> { const r = await this.prisma.merchant.findUnique({ where: { id } }); return r ? this.mapMerchant(r) : null; }

  async list(opts?: { status?: MerchantStatus; tenantId?: string; limit?: number; offset?: number }): Promise<Merchant[]> {
    const where: any = {};
    if (opts?.status) where.status = opts.status;
    if (opts?.tenantId) where.tenant_id = opts.tenantId;
    const rows = await this.prisma.merchant.findMany({ where, orderBy: { name: 'asc' }, take: opts?.limit ?? 50, skip: opts?.offset ?? 0 });
    return rows.map(r => this.mapMerchant(r));
  }

  async search(query: string): Promise<Merchant[]> {
    const rows = await this.prisma.merchant.findMany({
      where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { tags: { has: query } }] },
      orderBy: { trust_score: 'desc' },
      take: 20,
    });
    return rows.map(r => this.mapMerchant(r));
  }

  private mapMerchant(row: any): Merchant { return { id: row.id, tenantId: row.tenant_id, name: row.name, slug: row.slug, logoUrl: row.logo_url ?? undefined, website: row.website ?? undefined, description: row.description ?? undefined, registrationNumber: row.registration_number ?? undefined, businessType: row.business_type ?? undefined, trustScore: Number(row.trust_score ?? 0), commissionRate: Number(row.commission_rate ?? 0), verified: row.verified, status: row.status, certifications: row.certifications ?? [], tags: row.tags ?? [], socialLinks: (row.social_links as Record<string, unknown>) ?? {}, policies: (row.policies as Record<string, unknown>) ?? {}, createdAt: row.created_at }; }
  private mapVerification(row: any): MerchantVerification { return { id: row.id, merchantId: row.merchant_id, level: row.level as VerificationLevel, status: row.status as VerificationStatus, documents: (row.documents as unknown[]) ?? [], reviewerId: row.reviewer_id ?? undefined, notes: row.notes ?? undefined, expiresAt: row.expires_at ?? undefined, createdAt: row.created_at }; }
}
