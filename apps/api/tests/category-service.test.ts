import { describe, expect, it, vi } from 'vitest';
import { CategoryService } from '../src/services/category-service.js';

function mockPrisma() {
  const categories = [
    { id: 'cat_1', tenant_id: 'public', name: 'Electronics', slug: 'electronics', parent_id: null, icon: '📱', description: 'Devices and gadgets', comparison_template: [], sort_order: 1, active: true, created_at: new Date() },
  ];

  return {
    category: {
      findMany: vi.fn().mockResolvedValue(categories),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return categories.find(c => c.slug === where.slug) ?? null;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        return categories.find(c => c.id === where.id) ?? null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'cat_new', ...data, active: true, sort_order: 0, created_at: new Date(),
      })),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const cat = categories.find(c => c.id === where.id);
        if (!cat) throw { code: 'P2025' };
        return { ...cat, ...data };
      }),
    },
    item: {
      groupBy: vi.fn().mockResolvedValue([
        { category_id: 'cat_1', _count: { id: 2 } },
      ]),
      count: vi.fn().mockResolvedValue(2),
    },
  };
}

describe('CategoryService (Prisma)', () => {
  it('lists categories with item counts', async () => {
    const prisma = mockPrisma();
    const svc = new CategoryService(prisma as any);
    const categories = await svc.list();

    expect(categories).toHaveLength(1);
    expect(categories[0]?.itemCount).toBe(2);
    expect(categories[0]?.name).toBe('Electronics');
  });

  it('gets a category by slug with item count', async () => {
    const prisma = mockPrisma();
    const svc = new CategoryService(prisma as any);
    const cat = await svc.getBySlug('electronics');

    expect(cat).not.toBeNull();
    expect(cat?.slug).toBe('electronics');
    expect(cat?.itemCount).toBe(2);
  });

  it('returns null for non-existent slug', async () => {
    const prisma = mockPrisma();
    prisma.category.findFirst.mockResolvedValue(null);
    const svc = new CategoryService(prisma as any);
    const cat = await svc.getBySlug('nonexistent');

    expect(cat).toBeNull();
  });

  it('creates a category with validation', async () => {
    const prisma = mockPrisma();
    const svc = new CategoryService(prisma as any);
    const result = await svc.create({ name: 'Travel', slug: 'travel', description: 'Travel services' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Travel');
      expect(result.value.slug).toBe('travel');
    }
  });

  it('returns validation error for empty name', async () => {
    const prisma = mockPrisma();
    const svc = new CategoryService(prisma as any);
    const result = await svc.create({ name: '', slug: 'test' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.statusCode).toBe(400);
    }
  });

  it('returns 409 conflict for duplicate slug', async () => {
    const prisma = mockPrisma();

    // Create an error that looks like PrismaClientKnownRequestError
    const duplicateError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['tenant_id', 'slug'] },
    });
    Object.defineProperty(duplicateError, 'constructor', { value: { name: 'PrismaClientKnownRequestError' } });
    // The service uses instanceof check, so we need to set the prototype
    Object.setPrototypeOf(duplicateError, { constructor: { name: 'PrismaClientKnownRequestError' } });
    prisma.category.create.mockRejectedValue(duplicateError);

    const svc = new CategoryService(prisma as any);
    const result = await svc.create({ name: 'Electronics', slug: 'electronics' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('duplicate_slug');
      expect(result.error.statusCode).toBe(409);
    }
  });

  it('soft-deletes a category', async () => {
    const prisma = mockPrisma();
    const svc = new CategoryService(prisma as any);
    const result = await svc.delete('cat_1');

    expect(result.ok).toBe(true);
    expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'cat_1' }, data: { active: false } });
  });
});
