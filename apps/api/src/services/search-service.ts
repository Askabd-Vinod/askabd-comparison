import { DbClient } from '../db/connection.js';

export interface SearchResultItem {
  id: string;
  name: string;
  slug: string;
  brand?: string;
  description?: string;
  priceCurrent?: number;
  priceCurrency?: string;
  rating?: number;
  reviewCount?: number;
  merchant?: string;
  availability?: string;
}

export interface SearchResultCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
}

export interface SearchResultBrand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  verified?: boolean;
}

export interface SearchResponse {
  query: string;
  items: SearchResultItem[];
  categories: SearchResultCategory[];
  brands: SearchResultBrand[];
}

export class SearchService {
  constructor(private readonly db: DbClient) {}

  async search(query: string): Promise<SearchResponse> {
    const trimmed = query.trim();
    const normalized = trimmed.toLowerCase();

    if (!normalized) {
      return { query: '', items: [], categories: [], brands: [] };
    }

    const [categories, items, brands] = await Promise.all([
      this.db.query<any>('SELECT id, name, slug, description, icon FROM category WHERE active=TRUE AND (name ILIKE $1 OR slug ILIKE $1) ORDER BY name LIMIT 6', [`%${trimmed}%`]),
      this.db.query<any>('SELECT id, name, slug, brand, description, price_current, price_currency, rating, review_count, merchant, availability FROM item WHERE status=$1 AND (name ILIKE $2 OR brand ILIKE $2 OR slug ILIKE $2) ORDER BY rating DESC, review_count DESC LIMIT 8', ['active', `%${trimmed}%`, `%${trimmed}%`]),
      this.db.query<any>('SELECT id, name, slug, description, verified FROM brand WHERE status=$1 AND (name ILIKE $2 OR slug ILIKE $2) ORDER BY name LIMIT 6', ['active', `%${trimmed}%`, `%${trimmed}%`]),
    ]);

    return {
      query: trimmed,
      items: items.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        brand: row.brand,
        description: row.description,
        priceCurrent: row.price_current ? Number(row.price_current) : undefined,
        priceCurrency: row.price_currency,
        rating: row.rating ? Number(row.rating) : undefined,
        reviewCount: row.review_count ? Number(row.review_count) : undefined,
        merchant: row.merchant,
        availability: row.availability,
      })),
      categories: categories.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        icon: row.icon,
      })),
      brands: brands.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        verified: row.verified,
      })),
    };
  }
}
