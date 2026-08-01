import { PrismaClient } from '@prisma/client';

/**
 * Performance Seed — generates bulk data for load testing.
 * Creates 100 items across categories to test pagination, search, and comparison.
 * Idempotent: uses upsert by unique slug.
 */
export async function seedPerformance(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log('  → Seeding performance data (100 items)...');

  const electronics = await prisma.category.findFirst({ where: { tenant_id: tenantId, slug: 'electronics' } });
  if (!electronics) { console.log('  ⚠ Electronics category not found.'); return; }

  const brands = ['Apple', 'Samsung', 'Google', 'Sony', 'Microsoft', 'OnePlus', 'Xiaomi', 'Huawei', 'LG', 'Asus'];
  const productTypes = ['Phone', 'Laptop', 'Tablet', 'Headphones', 'Watch', 'Speaker', 'Camera', 'Monitor', 'Keyboard', 'Mouse'];

  let count = 0;
  for (let i = 1; i <= 100; i++) {
    const brand = brands[i % brands.length]!;
    const type = productTypes[i % productTypes.length]!;
    const slug = `perf-${type.toLowerCase()}-${brand.toLowerCase()}-${i}`;
    const price = BigInt(Math.floor(Math.random() * 200000) + 5000);

    await prisma.item.upsert({
      where: { tenant_id_slug: { tenant_id: tenantId, slug } },
      create: {
        tenant_id: tenantId, category_id: electronics.id,
        name: `${brand} ${type} ${i}`, slug, brand_name: brand,
        price_current: price, price_currency: 'USD',
        specifications: { brand, type, model: `Model-${i}`, year: 2025 + (i % 3) } as any,
        pros: [`Pro feature ${i}a`, `Pro feature ${i}b`],
        cons: [`Con ${i}`],
        tags: [brand.toLowerCase(), type.toLowerCase(), 'performance-test'],
        rating: Number((3 + Math.random() * 2).toFixed(2)),
        status: 'active', published_at: new Date(),
      },
      update: { price_current: price },
    });
    count++;
  }

  console.log(`  ✓ ${count} performance items seeded.`);
}
