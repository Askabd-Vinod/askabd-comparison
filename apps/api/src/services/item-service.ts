import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { type Result } from './types.js';

export interface Item {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  slug: string;
  brand?: string;
  description?: string;
  images: string[];
  specifications: Record<string, unknown>;
  pros: string[];
  cons: string[];
  rating: number;
  reviewCount: number;
  priceCurrent?: number;
  priceOriginal?: number;
  priceCurrency: string;
  priceHistory: unknown[];
  availability: string;
  merchant?: string;
  merchantUrl?: string;
  offers: unknown[];
  warranty?: string;
  deliveryInfo: Record<string, unknown>;
  tags: string[];
  status: string;
  createdAt: Date;
}

const CreateItemSchema = z.object({
  tenantId: z.string().max(255).default('public'),
  categoryId: z.string().uuid('Valid category ID required'),
  name: z.string().min(1, 'Name is required').max(500),
  slug: z.string().max(500).optional(),
  brand: z.string().max(255).optional(),
  description: z.string().optional(),
  images: z.array(z.string()).default([]),
  specifications: z.record(z.unknown()).default({}),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  priceCurrent: z.number().optional(),
  priceOriginal: z.number().optional(),
  priceCurrency: z.string().max(3).default('USD'),
  availability: z.string().max(30).default('available'),
  merchant: z.string().max(255).optional(),
  merchantUrl: z.string().optional(),
  offers: z.array(z.unknown()).default([]),
  warranty: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdBy: z.string().uuid().optional(),
});

export class ItemService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: unknown): Promise<Result<Item>> {
    const parsed = CreateItemSchema.safeParse(input);
    if (!parsed.success) {
      const e = parsed.error.errors[0]!;
      return { ok: false, error: { category: 'validation', code: 'invalid_input', field: e.path.join('.'), message: e.message, statusCode: 400 } };
    }
    const d = parsed.data;
    const slug = d.slug || d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    try {
      const row = await this.prisma.item.create({
        data: {
          tenant_id: d.tenantId,
          category_id: d.categoryId,
          name: d.name,
          slug,
          brand_name: d.brand ?? null,
          description: d.description ?? null,
          images: d.images as any,
          specifications: d.specifications as any,
          pros: d.pros,
          cons: d.cons,
          price_current: d.priceCurrent != null ? BigInt(d.priceCurrent) : null,
          price_original: d.priceOriginal != null ? BigInt(d.priceOriginal) : null,
          price_currency: d.priceCurrency,
          availability: d.availability,
          merchant_name: d.merchant ?? null,
          merchant_url: d.merchantUrl ?? null,
          offers: d.offers as any,
          warranty: d.warranty ?? null,
          tags: d.tags,
          created_by: d.createdBy ?? null,
        },
      });
      return { ok: true, value: this.mapItem(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2002') {
        return { ok: false, error: { category: 'conflict', code: 'duplicate_slug', field: 'slug', message: `Item with slug "${slug}" already exists`, statusCode: 409 } };
      }
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2003') {
        return { ok: false, error: { category: 'validation', code: 'invalid_category', field: 'categoryId', message: 'Category does not exist', statusCode: 400 } };
      }
      throw e;
    }
  }

  async getById(id: string): Promise<Item | null> {
    const row = await this.prisma.item.findUnique({ where: { id } });
    return row ? this.mapItem(row) : null;
  }

  async getBySlug(slug: string, tenantId?: string): Promise<Item | null> {
    const tenant = tenantId ?? 'public';
    const row = await this.prisma.item.findFirst({
      where: { slug, OR: [{ tenant_id: tenant }, { tenant_id: 'public' }] },
    });
    return row ? this.mapItem(row) : null;
  }

  async listByCategory(categoryId: string, opts?: { limit?: number; offset?: number; sort?: string }): Promise<Item[]> {
    const orderBy = opts?.sort === 'price'
      ? { price_current: 'asc' as const }
      : opts?.sort === 'rating'
        ? { rating: 'desc' as const }
        : { created_at: 'desc' as const };

    const rows = await this.prisma.item.findMany({
      where: { category_id: categoryId, status: 'active' },
      orderBy,
      take: opts?.limit ?? 20,
      skip: opts?.offset ?? 0,
    });
    return rows.map(row => this.mapItem(row));
  }

  async compare(itemIds: string[]): Promise<Item[]> {
    if (itemIds.length === 0) return [];
    const rows = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
    });
    return rows.map(row => this.mapItem(row));
  }

  async search(query: string, tenantId?: string): Promise<Item[]> {
    const tenant = tenantId ?? 'public';
    const rows = await this.prisma.item.findMany({
      where: {
        status: 'active',
        OR: [{ tenant_id: tenant }, { tenant_id: 'public' }],
        AND: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { brand_name: { contains: query, mode: 'insensitive' } },
            { tags: { has: query } },
          ],
        },
      },
      orderBy: { rating: 'desc' },
      take: 20,
    });
    return rows.map(row => this.mapItem(row));
  }

  async update(id: string, input: Partial<{ name: string; slug: string; brand: string; description: string; priceCurrent: number; priceOriginal: number; availability: string; status: string; tags: string[] }>): Promise<Result<Item>> {
    try {
      const row = await this.prisma.item.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.brand !== undefined && { brand_name: input.brand }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.priceCurrent !== undefined && { price_current: BigInt(input.priceCurrent) }),
          ...(input.priceOriginal !== undefined && { price_original: BigInt(input.priceOriginal) }),
          ...(input.availability !== undefined && { availability: input.availability }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.tags !== undefined && { tags: input.tags }),
          updated_at: new Date(),
        },
      });
      return { ok: true, value: this.mapItem(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e) {
        if ((e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'item_not_found', message: 'Item not found', statusCode: 404 } };
        if ((e as any).code === 'P2002') return { ok: false, error: { category: 'conflict', code: 'duplicate_slug', field: 'slug', message: 'Slug already in use', statusCode: 409 } };
      }
      throw e;
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.prisma.item.update({ where: { id }, data: { status: 'archived' } });
      return { ok: true, value: undefined };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') {
        return { ok: false, error: { category: 'not_found', code: 'item_not_found', message: 'Item not found', statusCode: 404 } };
      }
      throw e;
    }
  }

  private mapItem(row: any): Item {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      categoryId: row.category_id,
      name: row.name,
      slug: row.slug,
      brand: row.brand_name ?? undefined,
      description: row.description ?? undefined,
      images: row.images ?? [],
      specifications: (row.specifications as Record<string, unknown>) ?? {},
      pros: row.pros ?? [],
      cons: row.cons ?? [],
      rating: Number(row.rating ?? 0),
      reviewCount: row.review_count ?? 0,
      priceCurrent: row.price_current != null ? Number(row.price_current) : undefined,
      priceOriginal: row.price_original != null ? Number(row.price_original) : undefined,
      priceCurrency: row.price_currency ?? 'USD',
      priceHistory: (row.price_history as unknown[]) ?? [],
      availability: row.availability ?? 'available',
      merchant: row.merchant_name ?? undefined,
      merchantUrl: row.merchant_url ?? undefined,
      offers: (row.offers as unknown[]) ?? [],
      warranty: row.warranty ?? undefined,
      deliveryInfo: (row.delivery_info as Record<string, unknown>) ?? {},
      tags: row.tags ?? [],
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
