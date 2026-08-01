import { PrismaClient } from '@prisma/client';

import { type Result } from './types.js';

export interface Review { id: string; itemId: string; userId: string; rating: number; title?: string; content?: string; pros: string[]; cons: string[]; verifiedPurchase: boolean; helpfulCount: number; status: string; createdAt: Date; }
export interface ReviewStats { averageRating: number; totalReviews: number; distribution: Record<string, number>; }

export class ReviewService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { itemId: string; userId: string; rating: number; title?: string; content?: string; pros?: string[]; cons?: string[]; verifiedPurchase?: boolean }): Promise<Result<Review>> {
    if (!input.itemId || !input.userId) return { ok: false, error: { category: 'validation', code: 'required', message: 'itemId and userId required', statusCode: 400 } };
    if (input.rating < 0 || input.rating > 5) return { ok: false, error: { category: 'validation', code: 'invalid_rating', field: 'rating', message: 'Rating must be 0-5', statusCode: 400 } };

    const row = await this.prisma.review.create({
      data: {
        item_id: input.itemId, user_id: input.userId, rating: input.rating,
        title: input.title ?? null, content: input.content ?? null,
        pros: input.pros ?? [], cons: input.cons ?? [],
        verified_purchase: input.verifiedPurchase ?? false, status: 'active',
      },
    });

    // Update item aggregate rating and review count
    const stats = await this.prisma.review.aggregate({
      where: { item_id: input.itemId, status: 'active' },
      _avg: { rating: true },
      _count: { id: true },
    });
    await this.prisma.item.update({
      where: { id: input.itemId },
      data: { rating: stats._avg.rating ?? 0, review_count: stats._count.id },
    });

    return { ok: true, value: this.mapReview(row) };
  }

  async getByItem(itemId: string, opts?: { limit?: number; offset?: number }): Promise<Review[]> {
    const rows = await this.prisma.review.findMany({
      where: { item_id: itemId, status: 'active' },
      orderBy: [{ helpful_count: 'desc' }, { created_at: 'desc' }],
      take: opts?.limit ?? 20,
      skip: opts?.offset ?? 0,
    });
    return rows.map(r => this.mapReview(r));
  }

  async getStats(itemId: string): Promise<ReviewStats> {
    const agg = await this.prisma.review.aggregate({
      where: { item_id: itemId, status: 'active' },
      _avg: { rating: true },
      _count: { id: true },
    });
    const groups = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { item_id: itemId, status: 'active' },
      _count: { id: true },
    });
    const distribution: Record<string, number> = {};
    for (const g of groups) { distribution[String(Math.floor(Number(g.rating)))] = g._count.id; }

    return { averageRating: Number(agg._avg.rating ?? 0), totalReviews: agg._count.id, distribution };
  }

  async moderate(reviewId: string, decision: 'approve' | 'reject'): Promise<Result<Review>> {
    const status = decision === 'approve' ? 'active' : 'rejected';
    try {
      const row = await this.prisma.review.update({ where: { id: reviewId }, data: { status } });
      return { ok: true, value: this.mapReview(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Review not found', statusCode: 404 } };
      throw e;
    }
  }

  async getPending(): Promise<Review[]> {
    const rows = await this.prisma.review.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(r => this.mapReview(r));
  }

  async markHelpful(reviewId: string): Promise<Result<void>> {
    try {
      await this.prisma.review.update({ where: { id: reviewId }, data: { helpful_count: { increment: 1 } } });
      return { ok: true, value: undefined };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Review not found', statusCode: 404 } };
      throw e;
    }
  }

  private mapReview(row: any): Review {
    return { id: row.id, itemId: row.item_id, userId: row.user_id, rating: Number(row.rating), title: row.title ?? undefined, content: row.content ?? undefined, pros: row.pros ?? [], cons: row.cons ?? [], verifiedPurchase: row.verified_purchase ?? false, helpfulCount: row.helpful_count ?? 0, status: row.status, createdAt: row.created_at };
  }
}
