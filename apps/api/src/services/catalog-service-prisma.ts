import { PrismaClient } from '@prisma/client';

export type Result<T> = { ok: true; value: T } | { ok: false; error: { category: string; code: string; field?: string; message: string; statusCode?: number } };

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
  constructor(private readonly prisma: PrismaClient) {}

  async createItem(input: { tenantId?: string; categoryId: string; brandId?: string; merchantId?: string; name: string; slug?: string; description?: string; specifications?: Record<string, unknown>; pros?: string[]; cons?: string[]; priceCurrent?: number; priceOriginal?: number; priceCurrency?: string; availability?: string; tags?: string[]; source?: string; locale?: string }): Promise<Result<CatalogItem>> {
    if (!input.name) return { ok: false, error: { category: 'validation', code: 'name_required', field: 'name', message: 'Name required', statusCode: 400 } };
    if (!input.categoryId) return { ok: false, error: { category: 'validation', code: 'category_required', field: 'categoryId', message: 'categoryId required', statusCode: 400 } };
    const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const row = await this.prisma.item.create({
        data: {
          tenant_id: input.tenantId ?? 'public', category_id: input.categoryId, brand_id: input.brandId ?? null, merchant_id: input.merchantId ?? null,
          name: input.name, slug, description: input.description ?? null,
          specifications: (input.specifications ?? {}) as any, pros: input.pros ?? [], cons: input.cons ?? [],
          price_current: input.priceCurrent != null ? BigInt(input.priceCurrent) : null,
          price_original: input.priceOriginal != null ? BigInt(input.priceOriginal) : null,
          price_currency: input.priceCurrency ?? 'USD', availability: input.availability ?? 'available',
          tags: input.tags ?? [], source: input.source ?? 'manual', locale: input.locale ?? 'en',
          status: 'active', published_at: new Date(),
        },
      });
      return { ok: true, value: this.mapItem(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e) {
        if ((e as any).code === 'P2002') return { ok: false, error: { category: 'conflict', code: 'duplicate_slug', field: 'slug', message: `Item slug "${slug}" already exists`, statusCode: 409 } };
        if ((e as any).code === 'P2003') return { ok: false, error: { category: 'validation', code: 'invalid_reference', message: 'Referenced entity does not exist', statusCode: 400 } };
      }
      throw e;
    }
  }

  async updateItem(id: string, updates: Partial<{ name: string; description: string; specifications: Record<string, unknown>; pros: string[]; cons: string[]; priceCurrent: number; priceOriginal: number; availability: string; tags: string[]; status: string }>): Promise<Result<CatalogItem>> {
    if (Object.keys(updates).length === 0) return { ok: false, error: { category: 'validation', code: 'no_updates', message: 'Nothing to update', statusCode: 400 } };
    try {
      const data: any = { updated_at: new Date() };
      if (updates.name) data.name = updates.name;
      if (updates.description !== undefined) data.description = updates.description;
      if (updates.specifications) data.specifications = updates.specifications;
      if (updates.pros) data.pros = updates.pros;
      if (updates.cons) data.cons = updates.cons;
      if (updates.priceCurrent !== undefined) data.price_current = BigInt(updates.priceCurrent);
      if (updates.priceOriginal !== undefined) data.price_original = BigInt(updates.priceOriginal);
      if (updates.availability) data.availability = updates.availability;
      if (updates.tags) data.tags = updates.tags;
      if (updates.status) data.status = updates.status;
      const row = await this.prisma.item.update({ where: { id }, data });
      return { ok: true, value: this.mapItem(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Item not found', statusCode: 404 } };
      throw e;
    }
  }

  async addMedia(input: { itemId: string; type: string; url: string; thumbnailUrl?: string; altText?: string; caption?: string; sortOrder?: number; isPrimary?: boolean }): Promise<Result<ItemMedia>> {
    if (!input.url) return { ok: false, error: { category: 'validation', code: 'url_required', field: 'url', message: 'URL required', statusCode: 400 } };
    const row = await this.prisma.item_media.create({
      data: { item_id: input.itemId, type: input.type ?? 'image', url: input.url, thumbnail_url: input.thumbnailUrl ?? null, alt_text: input.altText ?? null, caption: input.caption ?? null, sort_order: input.sortOrder ?? 0, is_primary: input.isPrimary ?? false },
    });
    return { ok: true, value: this.mapMedia(row) };
  }

  async getMedia(itemId: string): Promise<ItemMedia[]> {
    const rows = await this.prisma.item_media.findMany({ where: { item_id: itemId }, orderBy: { sort_order: 'asc' } });
    return rows.map(r => this.mapMedia(r));
  }

  async addRelation(input: { itemId: string; relatedItemId: string; relationType?: string }): Promise<Result<ItemRelation>> {
    try {
      const row = await this.prisma.item_relation.create({
        data: { item_id: input.itemId, related_item_id: input.relatedItemId, relation_type: input.relationType ?? 'similar' },
      });
      return { ok: true, value: this.mapRelation(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2002') return { ok: false, error: { category: 'conflict', code: 'relation_exists', message: 'Relation already exists', statusCode: 409 } };
      throw e;
    }
  }

  async getRelated(itemId: string, type?: string): Promise<CatalogItem[]> {
    const where: any = { item_id: itemId };
    if (type) where.relation_type = type;
    const relations = await this.prisma.item_relation.findMany({
      where,
      orderBy: { sort_order: 'asc' },
      include: { item_item_relation_related_item_idToitem: true },
    });
    return relations.map(r => this.mapItem(r.item_item_relation_related_item_idToitem));
  }

  async bulkImport(items: Parameters<CatalogService['createItem']>[0][]): Promise<Result<{ imported: number; errors: number }>> {
    let imported = 0; let errors = 0;
    for (const item of items) { const r = await this.createItem(item); if (r.ok) imported++; else errors++; }
    return { ok: true, value: { imported, errors } };
  }

  private mapItem(row: any): CatalogItem {
    return { id: row.id, tenantId: row.tenant_id, categoryId: row.category_id, brandId: row.brand_id ?? undefined, merchantId: row.merchant_id ?? undefined, name: row.name, slug: row.slug, description: row.description ?? undefined, specifications: (row.specifications as Record<string, unknown>) ?? {}, pros: row.pros ?? [], cons: row.cons ?? [], rating: Number(row.rating ?? 0), reviewCount: row.review_count ?? 0, priceCurrent: row.price_current != null ? Number(row.price_current) : undefined, priceOriginal: row.price_original != null ? Number(row.price_original) : undefined, priceCurrency: row.price_currency ?? 'USD', availability: row.availability ?? 'available', tags: row.tags ?? [], status: row.status, source: row.source ?? 'manual', locale: row.locale ?? 'en', publishedAt: row.published_at ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private mapMedia(row: any): ItemMedia {
    return { id: row.id, itemId: row.item_id, type: row.type, url: row.url, thumbnailUrl: row.thumbnail_url ?? undefined, altText: row.alt_text ?? undefined, caption: row.caption ?? undefined, sortOrder: row.sort_order ?? 0, isPrimary: row.is_primary ?? false };
  }

  private mapRelation(row: any): ItemRelation {
    return { id: row.id, itemId: row.item_id, relatedItemId: row.related_item_id, relationType: row.relation_type, sortOrder: row.sort_order ?? 0 };
  }
}
