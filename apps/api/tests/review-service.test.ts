import { describe, it, expect } from 'vitest';
import { ReviewService } from '../src/services/review-service.js';

function mockDb() {
  const reviews: any[] = [];
  return { query: async <T>(sql: string, params?: unknown[]) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into review')) {
      const [id, item_id, user_id, rating, title, content, pros, cons, verified_purchase, status] = params as any[];
      const row = { id, item_id, user_id, rating, title, content, pros, cons, verified_purchase, status, helpful_count: 0, created_at: new Date() };
      reviews.push(row); return { rows: [row] as T[], rowCount: 1 };
    }
    if (s.includes('update item set rating')) return { rows: [] as T[], rowCount: 1 };
    if (s.includes('select') && s.includes('review') && s.includes('item_id=$1') && s.includes('status=')) {
      const [itemId] = params as string[]; return { rows: reviews.filter((r) => r.item_id === itemId && r.status === 'active') as T[], rowCount: 0 };
    }
    if (s.includes('select') && s.includes('avg(rating)')) {
      const [itemId] = params as string[]; const active = reviews.filter((r) => r.item_id === itemId && r.status === 'active');
      const avg = active.length > 0 ? active.reduce((s, r) => s + r.rating, 0) / active.length : 0;
      return { rows: [{ avg, total: active.length }] as T[], rowCount: 1 };
    }
    if (s.includes('group by rating')) { return { rows: [] as T[], rowCount: 0 }; }
    if (s.includes('update review')) { const [status, id] = params as string[]; const rev = reviews.find((r) => r.id === id); if (rev) rev.status = status; return { rows: rev ? [rev] as T[] : [] as T[], rowCount: rev ? 1 : 0 }; }
    if (s.includes('select') && s.includes('pending')) { return { rows: reviews.filter((r) => r.status === 'pending') as T[], rowCount: 0 }; }
    if (s.includes('update review set helpful')) { return { rows: [] as T[], rowCount: 1 }; }
    return { rows: [] as T[], rowCount: 0 };
  }};
}

describe('ReviewService', () => {
  it('creates a review', async () => { const svc = new ReviewService(mockDb() as any); const r = await svc.create({ itemId: 'i1', userId: 'u1', rating: 4.5, title: 'Great product', pros: ['Fast', 'Reliable'], cons: ['Pricey'] }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.rating).toBe(4.5); expect(r.value.pros).toContain('Fast'); });
  it('rejects invalid rating', async () => { const svc = new ReviewService(mockDb() as any); const r = await svc.create({ itemId: 'i1', userId: 'u1', rating: 6 }); expect(r.ok).toBe(false); });
  it('moderates review', async () => { const svc = new ReviewService(mockDb() as any); const created = await svc.create({ itemId: 'i1', userId: 'u1', rating: 3 }); if (!created.ok) return; const r = await svc.moderate(created.value.id, 'reject'); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('rejected'); });
  it('gets stats', async () => { const svc = new ReviewService(mockDb() as any); await svc.create({ itemId: 'i1', userId: 'u1', rating: 5 }); await svc.create({ itemId: 'i1', userId: 'u2', rating: 4 }); const stats = await svc.getStats('i1'); expect(stats.averageRating).toBe(4.5); expect(stats.totalReviews).toBe(2); });
});
