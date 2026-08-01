import { describe, it, expect, vi } from 'vitest';
import { ReviewService } from '../src/services/review-service-prisma.js';

function mockPrisma() {
  const reviews: any[] = [];
  let counter = 0;
  const uid = () => `00000000-0000-0000-0000-00000000${String(++counter).padStart(4, '0')}`;

  return {
    review: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, helpful_count: 0, created_at: new Date() }; reviews.push(row); return row; }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.status === 'pending') return reviews.filter(r => r.status === 'pending');
        return reviews.filter(r => r.item_id === where.item_id && r.status === 'active');
      }),
      aggregate: vi.fn().mockImplementation(async ({ where }: any) => {
        const active = reviews.filter(r => r.item_id === where.item_id && r.status === 'active');
        const avg = active.length > 0 ? active.reduce((s, r) => s + Number(r.rating), 0) / active.length : 0;
        return { _avg: { rating: avg }, _count: { id: active.length } };
      }),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const rev = reviews.find(r => r.id === where.id);
        if (!rev) throw { code: 'P2025' };
        if (data.status) rev.status = data.status;
        if (data.helpful_count?.increment) rev.helpful_count += data.helpful_count.increment;
        return rev;
      }),
    },
    item: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('ReviewService (Prisma)', () => {
  it('creates a review', async () => {
    const svc = new ReviewService(mockPrisma() as any);
    const r = await svc.create({ itemId: 'i1', userId: 'u1', rating: 4.5, title: 'Great product', pros: ['Fast', 'Reliable'], cons: ['Pricey'] });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.rating).toBe(4.5);
    expect(r.value.pros).toContain('Fast');
  });

  it('rejects invalid rating', async () => {
    const svc = new ReviewService(mockPrisma() as any);
    const r = await svc.create({ itemId: 'i1', userId: 'u1', rating: 6 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('invalid_rating');
  });

  it('moderates review', async () => {
    const svc = new ReviewService(mockPrisma() as any);
    const created = await svc.create({ itemId: 'i1', userId: 'u1', rating: 3 });
    if (!created.ok) return;
    const r = await svc.moderate(created.value.id, 'reject');
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.status).toBe('rejected');
  });

  it('gets stats', async () => {
    const svc = new ReviewService(mockPrisma() as any);
    await svc.create({ itemId: 'i1', userId: 'u1', rating: 5 });
    await svc.create({ itemId: 'i1', userId: 'u2', rating: 4 });
    const stats = await svc.getStats('i1');
    expect(stats.averageRating).toBe(4.5);
    expect(stats.totalReviews).toBe(2);
  });
});
