import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';

import { type Result } from './types.js';

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  parentId?: string;
  icon?: string;
  description?: string;
  comparisonTemplate: unknown[];
  sortOrder: number;
  active: boolean;
  itemCount?: number;
}

const CreateCategorySchema = z.object({
  tenantId: z.string().max(255).default('public'),
  name: z.string().min(1, 'name is required').max(255),
  slug: z.string().min(1, 'slug is required').max(255).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  parentId: z.string().uuid().optional(),
  icon: z.string().max(100).optional(),
  description: z.string().optional(),
  comparisonTemplate: z.array(z.unknown()).default([]),
});

export class CategoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: unknown): Promise<Result<Category>> {
    const parsed = CreateCategorySchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]!;
      return { ok: false, error: { category: 'validation', code: 'invalid_input', field: firstError.path.join('.'), message: firstError.message, statusCode: 400 } };
    }
    const data = parsed.data;

    try {
      const row = await this.prisma.category.create({
        data: {
          tenant_id: data.tenantId,
          name: data.name,
          slug: data.slug,
          parent_id: data.parentId ?? null,
          icon: data.icon ?? null,
          description: data.description ?? null,
          comparison_template: data.comparisonTemplate as Prisma.InputJsonValue,
        },
      });
      return { ok: true, value: this.mapCategory(row, 0) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2002') {
        return { ok: false, error: { category: 'conflict', code: 'duplicate_slug', field: 'slug', message: `Category with slug "${data.slug}" already exists`, statusCode: 409 } };
      }
      throw e;
    }
  }

  async list(tenantId?: string): Promise<Category[]> {
    const tenant = tenantId ?? 'public';
    const rows = await this.prisma.category.findMany({
      where: {
        active: true,
        OR: [{ tenant_id: tenant }, { tenant_id: 'public' }],
      },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });

    const categoryIds = rows.map(r => r.id);
    const counts = await this.prisma.item.groupBy({
      by: ['category_id'],
      where: { category_id: { in: categoryIds }, status: 'active' },
      _count: { id: true },
    });
    const countMap = new Map(counts.map(c => [c.category_id, c._count.id]));

    return rows.map(row => this.mapCategory(row, countMap.get(row.id) ?? 0));
  }

  async getBySlug(slug: string, tenantId?: string): Promise<Category | null> {
    const tenant = tenantId ?? 'public';
    const row = await this.prisma.category.findFirst({
      where: {
        slug,
        OR: [{ tenant_id: tenant }, { tenant_id: 'public' }],
      },
    });
    if (!row) return null;

    const countResult = await this.prisma.item.count({
      where: { category_id: row.id, status: 'active' },
    });
    return this.mapCategory(row, countResult);
  }

  async getById(id: string): Promise<Category | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) return null;
    const countResult = await this.prisma.item.count({
      where: { category_id: row.id, status: 'active' },
    });
    return this.mapCategory(row, countResult);
  }

  async update(id: string, input: Partial<{ name: string; slug: string; icon: string; description: string; sortOrder: number; active: boolean; parentId: string }>): Promise<Result<Category>> {
    try {
      const row = await this.prisma.category.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.icon !== undefined && { icon: input.icon }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
          ...(input.active !== undefined && { active: input.active }),
          ...(input.parentId !== undefined && { parent_id: input.parentId }),
        },
      });
      return { ok: true, value: this.mapCategory(row, 0) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e) {
        if ((e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'category_not_found', message: 'Category not found', statusCode: 404 } };
        if ((e as any).code === 'P2002') return { ok: false, error: { category: 'conflict', code: 'duplicate_slug', field: 'slug', message: 'Slug already in use', statusCode: 409 } };
      }
      throw e;
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.prisma.category.update({ where: { id }, data: { active: false } });
      return { ok: true, value: undefined };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') {
        return { ok: false, error: { category: 'not_found', code: 'category_not_found', message: 'Category not found', statusCode: 404 } };
      }
      throw e;
    }
  }

  private mapCategory(row: any, itemCount: number): Category {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      slug: row.slug,
      parentId: row.parent_id ?? undefined,
      icon: row.icon ?? undefined,
      description: row.description ?? undefined,
      comparisonTemplate: row.comparison_template as unknown[] ?? [],
      sortOrder: row.sort_order ?? 0,
      active: row.active,
      itemCount,
    };
  }
}
