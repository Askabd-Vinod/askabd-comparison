import { PrismaClient } from '@prisma/client';

export type Result<T> = { ok: true; value: T } | { ok: false; error: { category: string; code: string; field?: string; message: string; statusCode?: number } };

export interface PriceEntry { id: string; itemId: string; variantId?: string; merchantId?: string; price: number; originalPrice?: number; currency: string; sourceUrl?: string; isAffiliate: boolean; validFrom: Date; validUntil?: Date; recordedAt: Date; }
export interface Offer { id: string; itemId?: string; merchantId?: string; type: string; title: string; description?: string; code?: string; discountValue?: number; discountType?: string; validFrom: Date; validUntil?: Date; terms?: string; url?: string; status: string; priority: number; }

export class PriceEngine {
  constructor(private readonly prisma: PrismaClient) {}

  async recordPrice(input: { itemId: string; variantId?: string; merchantId?: string; price: number; originalPrice?: number; currency?: string; sourceUrl?: string; isAffiliate?: boolean; validUntil?: Date }): Promise<Result<PriceEntry>> {
    if (!input.itemId || !input.price) return { ok: false, error: { category: 'validation', code: 'item_price_required', message: 'itemId and price required', statusCode: 400 } };
    const row = await this.prisma.item_price.create({
      data: {
        item_id: input.itemId, variant_id: input.variantId ?? null, merchant_id: input.merchantId ?? null,
        price: BigInt(input.price), original_price: input.originalPrice != null ? BigInt(input.originalPrice) : null,
        currency: input.currency ?? 'USD', source_url: input.sourceUrl ?? null,
        is_affiliate: input.isAffiliate ?? false, valid_until: input.validUntil ?? null,
      },
    });
    return { ok: true, value: this.mapPrice(row) };
  }

  async getPriceHistory(itemId: string, opts?: { merchantId?: string; limit?: number }): Promise<PriceEntry[]> {
    const where: any = { item_id: itemId };
    if (opts?.merchantId) where.merchant_id = opts.merchantId;
    const rows = await this.prisma.item_price.findMany({
      where, orderBy: { recorded_at: 'desc' }, take: opts?.limit ?? 30,
    });
    return rows.map(r => this.mapPrice(r));
  }

  async getLowestPrice(itemId: string): Promise<PriceEntry | null> {
    const row = await this.prisma.item_price.findFirst({
      where: { item_id: itemId, OR: [{ valid_until: null }, { valid_until: { gt: new Date() } }] },
      orderBy: { price: 'asc' },
    });
    return row ? this.mapPrice(row) : null;
  }

  async getMerchantPrices(itemId: string): Promise<PriceEntry[]> {
    // Prisma doesn't support DISTINCT ON directly — use raw grouping approach
    const rows = await this.prisma.item_price.findMany({
      where: { item_id: itemId, merchant_id: { not: null } },
      orderBy: [{ merchant_id: 'asc' }, { recorded_at: 'desc' }],
    });
    // Deduplicate: keep first (most recent) per merchant
    const seen = new Set<string>();
    const unique: typeof rows = [];
    for (const row of rows) {
      if (row.merchant_id && !seen.has(row.merchant_id)) {
        seen.add(row.merchant_id);
        unique.push(row);
      }
    }
    return unique.map(r => this.mapPrice(r));
  }

  async createOffer(input: { itemId?: string; merchantId?: string; type: string; title: string; description?: string; code?: string; discountValue?: number; discountType?: string; validFrom?: Date; validUntil?: Date; terms?: string; url?: string; priority?: number }): Promise<Result<Offer>> {
    if (!input.title) return { ok: false, error: { category: 'validation', code: 'title_required', field: 'title', message: 'Title required', statusCode: 400 } };
    const row = await this.prisma.offer.create({
      data: {
        item_id: input.itemId ?? null, merchant_id: input.merchantId ?? null,
        type: input.type ?? 'discount', title: input.title, description: input.description ?? null,
        code: input.code ?? null, discount_value: input.discountValue ?? null,
        discount_type: input.discountType ?? null, valid_from: input.validFrom ?? new Date(),
        valid_until: input.validUntil ?? null, terms: input.terms ?? null,
        url: input.url ?? null, priority: input.priority ?? 0,
      },
    });
    return { ok: true, value: this.mapOffer(row) };
  }

  async getActiveOffers(itemId: string): Promise<Offer[]> {
    const rows = await this.prisma.offer.findMany({
      where: { item_id: itemId, status: 'active', OR: [{ valid_until: null }, { valid_until: { gt: new Date() } }] },
      orderBy: { priority: 'desc' },
    });
    return rows.map(r => this.mapOffer(r));
  }

  async getTrendingDeals(limit?: number): Promise<Offer[]> {
    const rows = await this.prisma.offer.findMany({
      where: { status: 'active', OR: [{ valid_until: null }, { valid_until: { gt: new Date() } }] },
      orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
      take: limit ?? 20,
    });
    return rows.map(r => this.mapOffer(r));
  }

  private mapPrice(row: any): PriceEntry {
    return { id: row.id, itemId: row.item_id, variantId: row.variant_id ?? undefined, merchantId: row.merchant_id ?? undefined, price: Number(row.price), originalPrice: row.original_price != null ? Number(row.original_price) : undefined, currency: row.currency ?? 'USD', sourceUrl: row.source_url ?? undefined, isAffiliate: row.is_affiliate ?? false, validFrom: row.valid_from, validUntil: row.valid_until ?? undefined, recordedAt: row.recorded_at };
  }

  private mapOffer(row: any): Offer {
    return { id: row.id, itemId: row.item_id ?? undefined, merchantId: row.merchant_id ?? undefined, type: row.type, title: row.title, description: row.description ?? undefined, code: row.code ?? undefined, discountValue: row.discount_value != null ? Number(row.discount_value) : undefined, discountType: row.discount_type ?? undefined, validFrom: row.valid_from, validUntil: row.valid_until ?? undefined, terms: row.terms ?? undefined, url: row.url ?? undefined, status: row.status, priority: row.priority ?? 0 };
  }
}
