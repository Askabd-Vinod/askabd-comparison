import { PrismaClient } from '@prisma/client';

import { type Result } from './types.js';

export interface InventoryEntry { id: string; itemId: string; variantId?: string; merchantId: string; warehouse: string; location?: string; quantity: number; reserved: number; lowStockThreshold: number; status: string; }
export interface InventoryChange { id: string; inventoryId: string; changeType: string; quantityChange: number; quantityAfter: number; reason?: string; createdAt: Date; }
export interface PriceRule { id: string; merchantId?: string; itemId?: string; categoryId?: string; ruleType: string; name: string; config: Record<string, unknown>; priority: number; active: boolean; validFrom: Date; validUntil?: Date; }
export interface Campaign { id: string; merchantId?: string; tenantId: string; name: string; type: string; status: string; startsAt?: Date; endsAt?: Date; config: Record<string, unknown>; itemIds: string[]; categoryIds: string[]; }

function deriveStatus(quantity: number, threshold: number): string {
  if (quantity === 0) return 'out_of_stock';
  if (quantity <= threshold) return 'low_stock';
  return 'in_stock';
}

export class InventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async setStock(input: { itemId: string; merchantId: string; variantId?: string; warehouse?: string; quantity: number; lowStockThreshold?: number }): Promise<Result<InventoryEntry>> {
    if (input.quantity < 0) return { ok: false, error: { category: 'validation', code: 'negative_qty', message: 'Quantity cannot be negative', statusCode: 400 } };
    const threshold = input.lowStockThreshold ?? 5;
    const status = deriveStatus(input.quantity, threshold);
    const warehouse = input.warehouse ?? 'default';

    const row = await this.prisma.inventory.upsert({
      where: { item_id_variant_id_merchant_id_warehouse: { item_id: input.itemId, variant_id: (input.variantId ?? null) as any, merchant_id: input.merchantId, warehouse } },
      create: { item_id: input.itemId, variant_id: input.variantId ?? null, merchant_id: input.merchantId, warehouse, quantity: input.quantity, low_stock_threshold: threshold, status },
      update: { quantity: input.quantity, status, updated_at: new Date() },
    });
    return { ok: true, value: this.mapInv(row) };
  }

  async adjustStock(inventoryId: string, change: number, changeType: string, reason?: string, actorId?: string): Promise<Result<InventoryEntry>> {
    const inv = await this.prisma.inventory.findUnique({ where: { id: inventoryId } });
    if (!inv) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Inventory not found', statusCode: 404 } };

    const newQty = inv.quantity + change;
    if (newQty < 0) return { ok: false, error: { category: 'validation', code: 'insufficient_stock', message: 'Insufficient stock', statusCode: 400 } };

    const status = deriveStatus(newQty, inv.low_stock_threshold ?? 5);

    // Transaction: update inventory + record history atomically
    const [updated] = await this.prisma.$transaction([
      this.prisma.inventory.update({ where: { id: inventoryId }, data: { quantity: newQty, status, updated_at: new Date() } }),
      this.prisma.inventory_history.create({ data: { inventory_id: inventoryId, change_type: changeType, quantity_change: change, quantity_after: newQty, reason: reason ?? null, actor_id: actorId ?? null } }),
    ]);
    return { ok: true, value: this.mapInv(updated) };
  }

  async getByMerchant(merchantId: string, status?: string): Promise<InventoryEntry[]> {
    const where: any = { merchant_id: merchantId };
    if (status) where.status = status;
    const rows = await this.prisma.inventory.findMany({ where, orderBy: { updated_at: 'desc' } });
    return rows.map(r => this.mapInv(r));
  }

  async getLowStock(merchantId: string): Promise<InventoryEntry[]> {
    const rows = await this.prisma.inventory.findMany({
      where: { merchant_id: merchantId, status: { in: ['low_stock', 'out_of_stock'] } },
    });
    return rows.map(r => this.mapInv(r));
  }

  private mapInv(row: any): InventoryEntry { return { id: row.id, itemId: row.item_id, variantId: row.variant_id ?? undefined, merchantId: row.merchant_id, warehouse: row.warehouse ?? 'default', location: row.location ?? undefined, quantity: row.quantity, reserved: row.reserved ?? 0, lowStockThreshold: row.low_stock_threshold ?? 5, status: row.status }; }
}

export class PricingConsole {
  constructor(private readonly prisma: PrismaClient) {}

  async createRule(input: { merchantId?: string; itemId?: string; categoryId?: string; ruleType: string; name: string; config: Record<string, unknown>; priority?: number; validFrom?: Date; validUntil?: Date }): Promise<Result<PriceRule>> {
    if (!input.name || !input.ruleType) return { ok: false, error: { category: 'validation', code: 'required', message: 'name and ruleType required', statusCode: 400 } };
    const row = await this.prisma.price_rule.create({
      data: { merchant_id: input.merchantId ?? null, item_id: input.itemId ?? null, category_id: input.categoryId ?? null, rule_type: input.ruleType, name: input.name, config: input.config as any, priority: input.priority ?? 0, valid_from: input.validFrom ?? new Date(), valid_until: input.validUntil ?? null },
    });
    return { ok: true, value: this.mapRule(row) };
  }

  async listRules(merchantId: string): Promise<PriceRule[]> {
    const rows = await this.prisma.price_rule.findMany({
      where: { merchant_id: merchantId, active: true },
      orderBy: { priority: 'desc' },
    });
    return rows.map(r => this.mapRule(r));
  }

  private mapRule(row: any): PriceRule { return { id: row.id, merchantId: row.merchant_id ?? undefined, itemId: row.item_id ?? undefined, categoryId: row.category_id ?? undefined, ruleType: row.rule_type, name: row.name, config: (row.config as Record<string, unknown>) ?? {}, priority: row.priority ?? 0, active: row.active, validFrom: row.valid_from, validUntil: row.valid_until ?? undefined }; }
}

export class CampaignService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: { merchantId?: string; tenantId?: string; name: string; type: string; startsAt?: Date; endsAt?: Date; config?: Record<string, unknown>; itemIds?: string[]; categoryIds?: string[] }): Promise<Result<Campaign>> {
    if (!input.name) return { ok: false, error: { category: 'validation', code: 'name_required', message: 'Name required', statusCode: 400 } };
    const row = await this.prisma.campaign.create({
      data: { merchant_id: input.merchantId ?? null, tenant_id: input.tenantId ?? 'public', name: input.name, type: input.type ?? 'flash_sale', status: 'draft', starts_at: input.startsAt ?? null, ends_at: input.endsAt ?? null, config: (input.config ?? {}) as any, item_ids: input.itemIds ?? [], category_ids: input.categoryIds ?? [] },
    });
    return { ok: true, value: this.mapCampaign(row) };
  }

  async activate(campaignId: string): Promise<Result<Campaign>> {
    try {
      const row = await this.prisma.campaign.update({
        where: { id: campaignId, status: 'draft' },
        data: { status: 'active' },
      });
      return { ok: true, value: this.mapCampaign(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Campaign not found or not in draft', statusCode: 404 } };
      throw e;
    }
  }

  async listByMerchant(merchantId: string): Promise<Campaign[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { merchant_id: merchantId },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(r => this.mapCampaign(r));
  }

  private mapCampaign(row: any): Campaign { return { id: row.id, merchantId: row.merchant_id ?? undefined, tenantId: row.tenant_id, name: row.name, type: row.type, status: row.status, startsAt: row.starts_at ?? undefined, endsAt: row.ends_at ?? undefined, config: (row.config as Record<string, unknown>) ?? {}, itemIds: row.item_ids ?? [], categoryIds: row.category_ids ?? [] }; }
}
