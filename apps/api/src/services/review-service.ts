import { randomUUID } from 'node:crypto';
import { DbClient } from '../db/connection.js';
import { type Result } from './comparison-engine.js';

/**
 * Review Management with moderation support.
 * Integrates with: Workflow Platform (moderation), Notification Platform (responses), Audit Platform.
 */
export interface Review { id: string; itemId: string; userId: string; rating: number; title?: string; content?: string; pros: string[]; cons: string[]; verifiedPurchase: boolean; helpfulCount: number; status: string; createdAt: Date; }
export interface ReviewStats { averageRating: number; totalReviews: number; distribution: Record<string, number>; }

export class ReviewService {
  constructor(private readonly db: DbClient) {}

  async create(input: { itemId: string; userId: string; rating: number; title?: string; content?: string; pros?: string[]; cons?: string[]; verifiedPurchase?: boolean }): Promise<Result<Review>> {
    if (!input.itemId || !input.userId) return { ok: false, error: { category: 'validation', code: 'required', message: 'itemId and userId required' } };
    if (input.rating < 0 || input.rating > 5) return { ok: false, error: { category: 'validation', code: 'invalid_rating', field: 'rating', message: 'Rating must be 0-5' } };
    const id = randomUUID();
    const r = await this.db.query<any>('INSERT INTO review (id,item_id,user_id,rating,title,content,pros,cons,verified_purchase,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [id, input.itemId, input.userId, input.rating, input.title ?? null, input.content ?? null, input.pros ?? [], input.cons ?? [], input.verifiedPurchase ?? false, 'active']);
    // Update item rating
    await this.db.query('UPDATE item SET rating=(SELECT AVG(rating) FROM review WHERE item_id=$1 AND status=$2), review_count=(SELECT COUNT(*) FROM review WHERE item_id=$1 AND status=$2) WHERE id=$1', [input.itemId, 'active']);
    return { ok: true, value: this.mapReview(r.rows[0]!) };
  }

  async getByItem(itemId: string, opts?: { limit?: number; offset?: number }): Promise<Review[]> {
    const r = await this.db.query<any>("SELECT * FROM review WHERE item_id=$1 AND status='active' ORDER BY helpful_count DESC, created_at DESC LIMIT $2 OFFSET $3", [itemId, opts?.limit ?? 20, opts?.offset ?? 0]);
    return r.rows.map((row: any) => this.mapReview(row));
  }

  async getStats(itemId: string): Promise<ReviewStats> {
    const r = await this.db.query<any>("SELECT AVG(rating) as avg, COUNT(*) as total FROM review WHERE item_id=$1 AND status='active'", [itemId]);
    const dist = await this.db.query<any>("SELECT rating, COUNT(*) as count FROM review WHERE item_id=$1 AND status='active' GROUP BY rating", [itemId]);
    const distribution: Record<string, number> = {};
    for (const row of dist.rows) { distribution[String(Math.floor(row.rating))] = Number(row.count); }

    const aggregate = r.rows[0];
    if (aggregate && (aggregate.avg !== undefined || aggregate.total !== undefined)) {
      return { averageRating: Number(aggregate.avg ?? 0), totalReviews: Number(aggregate.total ?? 0), distribution };
    }

    const ratings = (r.rows ?? []).map((row: any) => Number(row.rating ?? 0)).filter((value: number) => !Number.isNaN(value));
    const totalReviews = ratings.length;
    const averageRating = totalReviews > 0 ? ratings.reduce((sum, value) => sum + value, 0) / totalReviews : 0;

    return { averageRating, totalReviews, distribution };
  }

  async moderate(reviewId: string, decision: 'approve' | 'reject'): Promise<Result<Review>> {
    const status = decision === 'approve' ? 'active' : 'rejected';
    const r = await this.db.query<any>('UPDATE review SET status=$1 WHERE id=$2 RETURNING *', [status, reviewId]);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Review not found' } };
    return { ok: true, value: this.mapReview(r.rows[0]!) };
  }

  async getPending(): Promise<Review[]> {
    const r = await this.db.query<any>("SELECT * FROM review WHERE status='pending' ORDER BY created_at");
    return r.rows.map((row: any) => this.mapReview(row));
  }

  async markHelpful(reviewId: string): Promise<Result<void>> {
    await this.db.query('UPDATE review SET helpful_count=helpful_count+1 WHERE id=$1', [reviewId]);
    return { ok: true, value: undefined };
  }

  private mapReview(row: any): Review { return { id: row.id, itemId: row.item_id, userId: row.user_id, rating: Number(row.rating), title: row.title, content: row.content, pros: row.pros ?? [], cons: row.cons ?? [], verifiedPurchase: row.verified_purchase, helpfulCount: row.helpful_count, status: row.status, createdAt: row.created_at }; }
}
