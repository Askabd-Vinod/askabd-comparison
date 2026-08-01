import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { validateInput } from './validate.js';
import { type Result } from './types.js';

export interface Comparison {
  id: string;
  userId: string;
  title?: string;
  categoryId?: string;
  itemIds: string[];
  notes?: string;
  isPublic: boolean;
  shareToken?: string;
  createdAt: Date;
}

const CreateComparisonSchema = z.object({
  userId: z.string().uuid('Valid userId required'),
  title: z.string().max(500).optional(),
  categoryId: z.string().uuid().optional(),
  itemIds: z.array(z.string().uuid()).min(2, 'At least 2 items required for comparison'),
  notes: z.string().optional(),
  isPublic: z.boolean().default(false),
});

export class ComparisonService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: unknown): Promise<Result<Comparison>> {
    const validated = validateInput(CreateComparisonSchema, input);
    if (!validated.ok) return validated;
    const d = validated.value;
    const shareToken = d.isPublic ? randomUUID().substring(0, 12) : null;

    const row = await this.prisma.comparison.create({
      data: {
        user_id: d.userId,
        title: d.title ?? null,
        category_id: d.categoryId ?? null,
        item_ids: d.itemIds,
        notes: d.notes ?? null,
        is_public: d.isPublic,
        share_token: shareToken,
      },
    });
    return { ok: true, value: this.mapComparison(row) };
  }

  async listByUser(userId: string): Promise<Comparison[]> {
    const rows = await this.prisma.comparison.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(row => this.mapComparison(row));
  }

  async getByShareToken(token: string): Promise<Comparison | null> {
    const row = await this.prisma.comparison.findFirst({
      where: { share_token: token, is_public: true },
    });
    return row ? this.mapComparison(row) : null;
  }

  async getById(id: string): Promise<Comparison | null> {
    const row = await this.prisma.comparison.findUnique({ where: { id } });
    return row ? this.mapComparison(row) : null;
  }

  private mapComparison(row: any): Comparison {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title ?? undefined,
      categoryId: row.category_id ?? undefined,
      itemIds: row.item_ids ?? [],
      notes: row.notes ?? undefined,
      isPublic: row.is_public,
      shareToken: row.share_token ?? undefined,
      createdAt: row.created_at,
    };
  }
}
