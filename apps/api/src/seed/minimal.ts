import { PrismaClient } from '@prisma/client';

/**
 * Minimal Seed — core categories only.
 * Creates the essential category structure needed for a functional platform.
 * Idempotent: uses upsert by (tenant_id, slug).
 */
export async function seedMinimal(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log('  → Seeding minimal categories...');

  const categories = [
    { name: 'Electronics', slug: 'electronics', icon: '📱', description: 'Smartphones, laptops, gadgets, and accessories' },
    { name: 'Travel', slug: 'travel', icon: '✈️', description: 'Flights, hotels, travel packages, and experiences' },
    { name: 'Insurance', slug: 'insurance', icon: '🛡️', description: 'Health, life, auto, and property insurance' },
    { name: 'Education', slug: 'education', icon: '🎓', description: 'Courses, certifications, and learning platforms' },
    { name: 'Banking', slug: 'banking', icon: '🏦', description: 'Credit cards, savings accounts, and loans' },
    { name: 'Software', slug: 'software', icon: '💻', description: 'SaaS tools, productivity apps, and developer tools' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { tenant_id_slug: { tenant_id: tenantId, slug: cat.slug } },
      create: { tenant_id: tenantId, name: cat.name, slug: cat.slug, icon: cat.icon, description: cat.description, active: true },
      update: { name: cat.name, icon: cat.icon, description: cat.description, active: true },
    });
  }

  console.log(`  ✓ ${categories.length} categories seeded.`);
}
