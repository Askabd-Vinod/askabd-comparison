import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { validateInput } from './validate.js';
import { type Result } from './types.js';
export type AttributeDataType = 'text' | 'number' | 'boolean' | 'date' | 'enum' | 'url' | 'currency' | 'rating';

export interface ComparisonAttribute {
  id: string;
  templateId: string;
  name: string;
  slug: string;
  dataType: AttributeDataType;
  unit?: string;
  options: unknown[];
  isComparable: boolean;
  isFilterable: boolean;
  isRequired: boolean;
  displayOrder: number;
  groupName?: string;
  weight: number;
}

export interface ComparisonTemplate {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  attributeGroups: { name: string; attributeIds: string[] }[];
  layoutConfig: Record<string, unknown>;
  version: number;
  attributes?: ComparisonAttribute[];
}

const VALID_DATA_TYPES: AttributeDataType[] = ['text', 'number', 'boolean', 'date', 'enum', 'url', 'currency', 'rating'];

const CreateTemplateSchema = z.object({
  categoryId: z.string().uuid('Valid categoryId required'),
  name: z.string().min(1, 'name is required').max(255),
  slug: z.string().min(1, 'slug is required').max(255),
  attributeGroups: z.array(z.unknown()).default([]),
  layoutConfig: z.record(z.unknown()).default({}),
});

const AddAttributeSchema = z.object({
  templateId: z.string().uuid('Valid templateId required'),
  name: z.string().min(1, 'name is required').max(255),
  slug: z.string().min(1, 'slug is required').max(255),
  dataType: z.enum(VALID_DATA_TYPES as [string, ...string[]]),
  unit: z.string().max(50).optional(),
  options: z.array(z.unknown()).default([]),
  isComparable: z.boolean().default(true),
  isFilterable: z.boolean().default(false),
  isRequired: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  groupName: z.string().max(100).optional(),
  weight: z.number().default(1.0),
});

export class TemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  async createTemplate(input: unknown): Promise<Result<ComparisonTemplate>> {
    const validated = validateInput(CreateTemplateSchema, input);
    if (!validated.ok) return validated;
    const d = validated.value;
    try {
      const row = await this.prisma.comparison_template.create({
        data: {
          category_id: d.categoryId,
          name: d.name,
          slug: d.slug,
          attribute_groups: d.attributeGroups as any,
          layout_config: d.layoutConfig as any,
        },
      });
      return { ok: true, value: this.mapTemplate(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2003') {
        return { ok: false, error: { category: 'validation', code: 'invalid_category', field: 'categoryId', message: 'Category does not exist', statusCode: 400 } };
      }
      throw e;
    }
  }

  async addAttribute(input: unknown): Promise<Result<ComparisonAttribute>> {
    const validated = validateInput(AddAttributeSchema, input);
    if (!validated.ok) return validated;
    const d = validated.value;
    try {
      const row = await this.prisma.comparison_attribute.create({
        data: {
          template_id: d.templateId,
          name: d.name,
          slug: d.slug,
          data_type: d.dataType,
          unit: d.unit ?? null,
          options: d.options as any,
          is_comparable: d.isComparable,
          is_filterable: d.isFilterable,
          is_required: d.isRequired,
          display_order: d.displayOrder,
          group_name: d.groupName ?? null,
          weight: d.weight,
        },
      });
      return { ok: true, value: this.mapAttribute(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2003') {
        return { ok: false, error: { category: 'validation', code: 'invalid_template', field: 'templateId', message: 'Template does not exist', statusCode: 400 } };
      }
      throw e;
    }
  }

  async getTemplateByCategory(categoryId: string): Promise<ComparisonTemplate | null> {
    const row = await this.prisma.comparison_template.findFirst({
      where: { category_id: categoryId },
      orderBy: { version: 'desc' },
      include: { comparison_attribute: { orderBy: { display_order: 'asc' } } },
    });
    if (!row) return null;
    const template = this.mapTemplate(row);
    template.attributes = row.comparison_attribute.map(a => this.mapAttribute(a));
    return template;
  }

  async getAttributes(templateId: string): Promise<ComparisonAttribute[]> {
    const rows = await this.prisma.comparison_attribute.findMany({
      where: { template_id: templateId },
      orderBy: { display_order: 'asc' },
    });
    return rows.map(a => this.mapAttribute(a));
  }

  async updateAttribute(attrId: string, updates: Partial<{ name: string; unit: string; options: unknown[]; isComparable: boolean; isFilterable: boolean; isRequired: boolean; displayOrder: number; groupName: string; weight: number }>): Promise<Result<ComparisonAttribute>> {
    if (Object.keys(updates).length === 0) {
      return { ok: false, error: { category: 'validation', code: 'no_updates', message: 'No fields to update', statusCode: 400 } };
    }
    try {
      const data: any = {};
      if (updates.name !== undefined) data.name = updates.name;
      if (updates.unit !== undefined) data.unit = updates.unit;
      if (updates.options !== undefined) data.options = updates.options;
      if (updates.isComparable !== undefined) data.is_comparable = updates.isComparable;
      if (updates.isFilterable !== undefined) data.is_filterable = updates.isFilterable;
      if (updates.isRequired !== undefined) data.is_required = updates.isRequired;
      if (updates.displayOrder !== undefined) data.display_order = updates.displayOrder;
      if (updates.groupName !== undefined) data.group_name = updates.groupName;
      if (updates.weight !== undefined) data.weight = updates.weight;

      const row = await this.prisma.comparison_attribute.update({
        where: { id: attrId },
        data,
      });
      return { ok: true, value: this.mapAttribute(row) };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') {
        return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Attribute not found', statusCode: 404 } };
      }
      throw e;
    }
  }

  async deleteAttribute(attrId: string): Promise<Result<void>> {
    try {
      await this.prisma.comparison_attribute.delete({ where: { id: attrId } });
      return { ok: true, value: undefined };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025') {
        return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Attribute not found', statusCode: 404 } };
      }
      throw e;
    }
  }

  async listTemplates(): Promise<ComparisonTemplate[]> {
    const rows = await this.prisma.comparison_template.findMany({ orderBy: { name: 'asc' } });
    return rows.map(row => this.mapTemplate(row));
  }

  private mapTemplate(row: any): ComparisonTemplate {
    return {
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      slug: row.slug,
      attributeGroups: (row.attribute_groups as any[]) ?? [],
      layoutConfig: (row.layout_config as Record<string, unknown>) ?? {},
      version: row.version,
    };
  }

  private mapAttribute(row: any): ComparisonAttribute {
    return {
      id: row.id,
      templateId: row.template_id,
      name: row.name,
      slug: row.slug,
      dataType: row.data_type as AttributeDataType,
      unit: row.unit ?? undefined,
      options: (row.options as unknown[]) ?? [],
      isComparable: row.is_comparable,
      isFilterable: row.is_filterable,
      isRequired: row.is_required,
      displayOrder: row.display_order ?? 0,
      groupName: row.group_name ?? undefined,
      weight: Number(row.weight ?? 1),
    };
  }
}
