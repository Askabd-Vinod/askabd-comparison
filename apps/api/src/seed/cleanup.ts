import { PrismaClient } from '@prisma/client';

/**
 * Cleanup — removes only seed/demo data.
 * NEVER removes production records.
 * Only deletes records belonging to the seed tenant.
 */
export async function cleanup(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log(`  → Cleaning up seed data (tenant: ${tenantId})...`);

  // Delete in dependency order (children before parents)
  const items = await prisma.item.findMany({ where: { tenant_id: tenantId }, select: { id: true } });
  const itemIds = items.map(i => i.id);

  if (itemIds.length > 0) {
    // Delete item-related data
    await prisma.item_media.deleteMany({ where: { item_id: { in: itemIds } } });
    await prisma.item_relation.deleteMany({ where: { item_id: { in: itemIds } } });
    await prisma.item_relation.deleteMany({ where: { related_item_id: { in: itemIds } } });
    await prisma.item_price.deleteMany({ where: { item_id: { in: itemIds } } });
    await prisma.item_variant.deleteMany({ where: { item_id: { in: itemIds } } });
    await prisma.review.deleteMany({ where: { item_id: { in: itemIds } } });
    await prisma.wishlist_item.deleteMany({ where: { item_id: { in: itemIds } } });
    await prisma.offer.deleteMany({ where: { item_id: { in: itemIds } } });
    console.log(`  ✓ Item-related data cleaned.`);
  }

  // Delete items
  const deletedItems = await prisma.item.deleteMany({ where: { tenant_id: tenantId } });
  console.log(`  ✓ ${deletedItems.count} items deleted.`);

  // Delete templates for seed categories
  const categories = await prisma.category.findMany({ where: { tenant_id: tenantId }, select: { id: true } });
  const catIds = categories.map(c => c.id);
  if (catIds.length > 0) {
    const templates = await prisma.comparison_template.findMany({ where: { category_id: { in: catIds } }, select: { id: true } });
    const tmplIds = templates.map(t => t.id);
    if (tmplIds.length > 0) {
      await prisma.comparison_attribute.deleteMany({ where: { template_id: { in: tmplIds } } });
      await prisma.comparison_template.deleteMany({ where: { id: { in: tmplIds } } });
      console.log(`  ✓ Templates and attributes cleaned.`);
    }
  }

  // Delete categories
  const deletedCats = await prisma.category.deleteMany({ where: { tenant_id: tenantId } });
  console.log(`  ✓ ${deletedCats.count} categories deleted.`);

  // Delete campaigns for seed tenant
  const deletedCampaigns = await prisma.campaign.deleteMany({ where: { tenant_id: tenantId } });
  if (deletedCampaigns.count > 0) console.log(`  ✓ ${deletedCampaigns.count} campaigns deleted.`);

  console.log('  ✓ Cleanup complete. Production data untouched.');
}
