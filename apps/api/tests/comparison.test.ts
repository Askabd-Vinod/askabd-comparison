import { describe, it, expect, vi } from 'vitest';
import { ComparisonService } from '../src/services/comparison-service.js';

function mockPrisma() {
  const comparisons: any[] = [];
  return {
    comparison: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `comp_${comparisons.length + 1}`, ...data, created_at: new Date(), updated_at: new Date() };
        comparisons.push(row);
        return row;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return comparisons.filter(c => c.user_id === where.user_id);
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return comparisons.find(c => c.share_token === where.share_token && c.is_public === true) ?? null;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        return comparisons.find(c => c.id === where.id) ?? null;
      }),
    },
  };
}

describe('ComparisonService (Prisma)', () => {
  it('creates a comparison with 2+ items', async () => {
    const prisma = mockPrisma();
    const svc = new ComparisonService(prisma as any);
    const r = await svc.create({ userId: '00000000-0000-0000-0000-000000000001', itemIds: ['00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011'], title: 'Phone vs Phone' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.itemIds).toHaveLength(2);
    expect(r.value.userId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('rejects comparison with < 2 items', async () => {
    const prisma = mockPrisma();
    const svc = new ComparisonService(prisma as any);
    const r = await svc.create({ userId: '00000000-0000-0000-0000-000000000001', itemIds: ['00000000-0000-0000-0000-000000000010'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain('At least 2 items');
  });

  it('generates share token for public comparisons', async () => {
    const prisma = mockPrisma();
    const svc = new ComparisonService(prisma as any);
    const r = await svc.create({ userId: '00000000-0000-0000-0000-000000000001', itemIds: ['00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012'], isPublic: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.shareToken).toBeTruthy();
    expect(r.value.isPublic).toBe(true);
  });

  it('lists comparisons by user', async () => {
    const prisma = mockPrisma();
    const svc = new ComparisonService(prisma as any);
    await svc.create({ userId: '00000000-0000-0000-0000-000000000001', itemIds: ['00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011'] });
    await svc.create({ userId: '00000000-0000-0000-0000-000000000001', itemIds: ['00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013'] });
    const list = await svc.listByUser('00000000-0000-0000-0000-000000000001');
    expect(list).toHaveLength(2);
  });
});
