import { PrismaClient } from '@prisma/client';

export interface SearchResultItem { id: string; name: string; slug: string; brand?: string; description?: string; priceCurrent?: number; priceCurrency?: string; rating?: number; reviewCount?: number; merchant?: string; availability?: string; }
export interface SearchResultCategory { id: string; name: string; slug: string; description?: string; icon?: string; }
export interface SearchResultBrand { id: string; name: string; slug: string; description?: string; verified?: boolean; }
export interface SearchResponse { query: string; items: SearchResultItem[]; categories: SearchResultCategory[]; brands: SearchResultBrand[]; }

export class SearchService {
  constructor(private readonly prisma: PrismaClient) {}

  async search(query: string): Promise<SearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) return { query: '', items: [], categories: [], brands: [] };

    // Execute all three searches in parallel
    const [categories, items, brands] = await Promise.all([
      this.prisma.category.findMany({
        where: { active: true, OR: [{ name: { contains: trimmed, mode: 'insensitive' } }, { slug: { contains: trimmed, mode: 'insensitive' } }] },
        select: { id: true, name: true, slug: true, description: true, icon: true },
        orderBy: { name: 'asc' },
        take: 6,
      }),
      this.prisma.item.findMany({
        where: { status: 'active', OR: [{ name: { contains: trimmed, mode: 'insensitive' } }, { brand_name: { contains: trimmed, mode: 'insensitive' } }, { slug: { contains: trimmed, mode: 'insensitive' } }] },
        select: { id: true, name: true, slug: true, brand_name: true, description: true, price_current: true, price_currency: true, rating: true, review_count: true, merchant_name: true, availability: true },
        orderBy: [{ rating: 'desc' }, { review_count: 'desc' }],
        take: 8,
      }),
      this.prisma.brand.findMany({
        where: { status: 'active', OR: [{ name: { contains: trimmed, mode: 'insensitive' } }, { slug: { contains: trimmed, mode: 'insensitive' } }] },
        select: { id: true, name: true, slug: true, description: true, verified: true },
        orderBy: { name: 'asc' },
        take: 6,
      }),
    ]);

    return {
      query: trimmed,
      items: items.map(row => ({
        id: row.id, name: row.name, slug: row.slug,
        brand: row.brand_name ?? undefined, description: row.description ?? undefined,
        priceCurrent: row.price_current != null ? Number(row.price_current) : undefined,
        priceCurrency: row.price_currency ?? undefined,
        rating: row.rating != null ? Number(row.rating) : undefined,
        reviewCount: row.review_count ?? undefined,
        merchant: row.merchant_name ?? undefined, availability: row.availability ?? undefined,
      })),
      categories: categories.map(row => ({
        id: row.id, name: row.name, slug: row.slug,
        description: row.description ?? undefined, icon: row.icon ?? undefined,
      })),
      brands: brands.map(row => ({
        id: row.id, name: row.name, slug: row.slug,
        description: row.description ?? undefined, verified: row.verified,
      })),
    };
  }
}
