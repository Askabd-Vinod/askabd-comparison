import { PrismaClient } from '@prisma/client';

/**
 * Demo Seed — sample items, brands, and templates for development/demos.
 * Idempotent: uses upsert by unique constraints.
 */
export async function seedDemo(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log('  → Seeding demo data...');

  // Brands
  const brands = [
    { name: 'Apple', slug: 'apple', website: 'https://apple.com', description: 'Consumer electronics and software', verified: true },
    { name: 'Samsung', slug: 'samsung', website: 'https://samsung.com', description: 'Electronics and home appliances', verified: true },
    { name: 'Google', slug: 'google', website: 'https://store.google.com', description: 'Search, cloud, and consumer hardware', verified: true },
    { name: 'Sony', slug: 'sony', website: 'https://sony.com', description: 'Entertainment and electronics', verified: true },
    { name: 'Microsoft', slug: 'microsoft', website: 'https://microsoft.com', description: 'Software and cloud services', verified: true },
  ];

  for (const b of brands) {
    await prisma.brand.upsert({
      where: { slug: b.slug },
      create: { name: b.name, slug: b.slug, website: b.website, description: b.description, verified: b.verified },
      update: { website: b.website, description: b.description, verified: b.verified },
    });
  }
  console.log(`  ✓ ${brands.length} brands seeded.`);

  // Get electronics category for items
  const electronics = await prisma.category.findFirst({ where: { tenant_id: tenantId, slug: 'electronics' } });
  if (!electronics) { console.log('  ⚠ Electronics category not found, skipping items.'); return; }

  // Items
  const items = [
    { name: 'iPhone 16 Pro', slug: 'iphone-16-pro', brand_name: 'Apple', price_current: BigInt(119900), price_currency: 'USD', specifications: { ram: '8GB', storage: '256GB', display: '6.3" OLED', chip: 'A18 Pro' } as any, pros: ['Best camera system', 'Titanium design', 'Action button'], cons: ['Expensive', 'No USB-C fast charging included'], tags: ['apple', 'flagship', 'phone'] },
    { name: 'Samsung Galaxy S25 Ultra', slug: 'galaxy-s25-ultra', brand_name: 'Samsung', price_current: BigInt(129900), price_currency: 'USD', specifications: { ram: '12GB', storage: '512GB', display: '6.9" Dynamic AMOLED', chip: 'Snapdragon 8 Gen 4' } as any, pros: ['S Pen included', 'Best display', '200MP camera'], cons: ['Large and heavy', 'Expensive'], tags: ['samsung', 'flagship', 'phone'] },
    { name: 'Google Pixel 9 Pro', slug: 'pixel-9-pro', brand_name: 'Google', price_current: BigInt(99900), price_currency: 'USD', specifications: { ram: '16GB', storage: '256GB', display: '6.3" LTPO OLED', chip: 'Tensor G4' } as any, pros: ['AI features', 'Clean Android', 'Great camera'], cons: ['Average battery', 'No expandable storage'], tags: ['google', 'flagship', 'phone', 'ai'] },
    { name: 'Sony WH-1000XM5', slug: 'sony-wh1000xm5', brand_name: 'Sony', price_current: BigInt(34999), price_currency: 'USD', specifications: { type: 'Over-ear', anc: true, battery: '30 hours', codec: 'LDAC, AAC, SBC' } as any, pros: ['Best ANC', 'Comfortable', 'Multipoint'], cons: ['No folding design', 'No IP rating'], tags: ['sony', 'headphones', 'audio'] },
    { name: 'MacBook Pro 16" M4 Pro', slug: 'macbook-pro-16-m4', brand_name: 'Apple', price_current: BigInt(249900), price_currency: 'USD', specifications: { ram: '24GB', storage: '512GB SSD', display: '16.2" Liquid Retina XDR', chip: 'M4 Pro' } as any, pros: ['Incredible performance', 'All-day battery', 'Beautiful display'], cons: ['Very expensive', 'Heavy'], tags: ['apple', 'laptop', 'professional'] },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { tenant_id_slug: { tenant_id: tenantId, slug: item.slug } },
      create: { tenant_id: tenantId, category_id: electronics.id, name: item.name, slug: item.slug, brand_name: item.brand_name, price_current: item.price_current, price_currency: item.price_currency, specifications: item.specifications, pros: item.pros, cons: item.cons, tags: item.tags, status: 'active', published_at: new Date() },
      update: { name: item.name, brand_name: item.brand_name, price_current: item.price_current, specifications: item.specifications, pros: item.pros, cons: item.cons, tags: item.tags },
    });
  }
  console.log(`  ✓ ${items.length} items seeded.`);

  // Template for electronics
  const existingTemplate = await prisma.comparison_template.findFirst({ where: { category_id: electronics.id } });
  if (!existingTemplate) {
    const tmpl = await prisma.comparison_template.create({
      data: { category_id: electronics.id, name: 'Smartphone Comparison', slug: 'smartphone-comparison', attribute_groups: [{ name: 'Performance', attributeIds: [] }, { name: 'Display', attributeIds: [] }, { name: 'Camera', attributeIds: [] }] },
    });
    const attrs = [
      { name: 'RAM', slug: 'ram', data_type: 'text', unit: 'GB', display_order: 1, group_name: 'Performance', is_filterable: true },
      { name: 'Storage', slug: 'storage', data_type: 'text', unit: 'GB', display_order: 2, group_name: 'Performance', is_filterable: true },
      { name: 'Display Size', slug: 'display-size', data_type: 'text', display_order: 3, group_name: 'Display' },
      { name: 'Battery', slug: 'battery', data_type: 'text', unit: 'mAh', display_order: 4, group_name: 'Performance' },
      { name: 'Price', slug: 'price', data_type: 'currency', display_order: 5, is_filterable: true },
    ];
    for (const attr of attrs) {
      await prisma.comparison_attribute.create({ data: { template_id: tmpl.id, ...attr, is_comparable: true, is_required: false } });
    }
    console.log(`  ✓ Template with ${attrs.length} attributes seeded.`);
  }
}
