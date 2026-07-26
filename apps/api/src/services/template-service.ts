import { randomUUID } from 'node:crypto';
import { DbClient } from '../db/connection.js';
import { type Result } from './comparison-engine.js';

/**
 * Comparison Template Engine
 * 
 * Supports:
 * - Dynamic templates per category
 * - Unlimited typed attributes (text, number, boolean, enum, currency, rating, date, url)
 * - Attribute groups for organized display
 * - Ordering, weighting (for scoring), required/optional
 * - Template versioning
 * - Category inheritance (child categories inherit parent template)
 */

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

export class TemplateService {
  constructor(private readonly db: DbClient) {}

  async createTemplate(input: { categoryId: string; name: string; slug: string; attributeGroups?: unknown[]; layoutConfig?: Record<string, unknown> }): Promise<Result<ComparisonTemplate>> {
    if (!input.name || !input.slug) return { ok: false, error: { category: 'validation', code: 'name_slug_required', field: 'name', message: 'name and slug required' } };
    if (!input.categoryId) return { ok: false, error: { category: 'validation', code: 'category_required', field: 'categoryId', message: 'categoryId required' } };
    const id = randomUUID();
    const r = await this.db.query<any>(
      'INSERT INTO comparison_template (id, category_id, name, slug, attribute_groups, layout_config) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, input.categoryId, input.name, input.slug, JSON.stringify(input.attributeGroups ?? []), JSON.stringify(input.layoutConfig ?? {})]);
    return { ok: true, value: this.mapTemplate(r.rows[0]!) };
  }

  async addAttribute(input: { templateId: string; name: string; slug: string; dataType: AttributeDataType; unit?: string; options?: unknown[]; isComparable?: boolean; isFilterable?: boolean; isRequired?: boolean; displayOrder?: number; groupName?: string; weight?: number }): Promise<Result<ComparisonAttribute>> {
    if (!input.name || !input.slug) return { ok: false, error: { category: 'validation', code: 'name_slug_required', field: 'name', message: 'name and slug required' } };
    if (!input.templateId) return { ok: false, error: { category: 'validation', code: 'template_required', field: 'templateId', message: 'templateId required' } };
    const validTypes: AttributeDataType[] = ['text', 'number', 'boolean', 'date', 'enum', 'url', 'currency', 'rating'];
    if (!validTypes.includes(input.dataType)) return { ok: false, error: { category: 'validation', code: 'invalid_data_type', field: 'dataType', message: `dataType must be one of: ${validTypes.join(', ')}` } };
    const id = randomUUID();
    const r = await this.db.query<any>(
      'INSERT INTO comparison_attribute (id, template_id, name, slug, data_type, unit, options, is_comparable, is_filterable, is_required, display_order, group_name, weight) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [id, input.templateId, input.name, input.slug, input.dataType, input.unit ?? null, JSON.stringify(input.options ?? []), input.isComparable ?? true, input.isFilterable ?? false, input.isRequired ?? false, input.displayOrder ?? 0, input.groupName ?? null, input.weight ?? 1.0]);
    return { ok: true, value: this.mapAttribute(r.rows[0]!) };
  }

  async getTemplateByCategory(categoryId: string): Promise<ComparisonTemplate | null> {
    const r = await this.db.query<any>('SELECT * FROM comparison_template WHERE category_id = $1 ORDER BY version DESC LIMIT 1', [categoryId]);
    if (r.rows.length === 0) return null;
    const template = this.mapTemplate(r.rows[0]!);
    // Load attributes
    const attrs = await this.db.query<any>('SELECT * FROM comparison_attribute WHERE template_id = $1 ORDER BY display_order', [template.id]);
    template.attributes = attrs.rows.map((a: any) => this.mapAttribute(a));
    return template;
  }

  async getAttributes(templateId: string): Promise<ComparisonAttribute[]> {
    const r = await this.db.query<any>('SELECT * FROM comparison_attribute WHERE template_id = $1 ORDER BY display_order', [templateId]);
    return r.rows.map((a: any) => this.mapAttribute(a));
  }

  async updateAttribute(attrId: string, updates: Partial<{ name: string; unit: string; options: unknown[]; isComparable: boolean; isFilterable: boolean; isRequired: boolean; displayOrder: number; groupName: string; weight: number }>): Promise<Result<ComparisonAttribute>> {
    const sets: string[] = []; const params: unknown[] = []; let idx = 1;
    if (updates.name !== undefined) { sets.push(`name=$${idx++}`); params.push(updates.name); }
    if (updates.unit !== undefined) { sets.push(`unit=$${idx++}`); params.push(updates.unit); }
    if (updates.options !== undefined) { sets.push(`options=$${idx++}`); params.push(JSON.stringify(updates.options)); }
    if (updates.isComparable !== undefined) { sets.push(`is_comparable=$${idx++}`); params.push(updates.isComparable); }
    if (updates.isFilterable !== undefined) { sets.push(`is_filterable=$${idx++}`); params.push(updates.isFilterable); }
    if (updates.isRequired !== undefined) { sets.push(`is_required=$${idx++}`); params.push(updates.isRequired); }
    if (updates.displayOrder !== undefined) { sets.push(`display_order=$${idx++}`); params.push(updates.displayOrder); }
    if (updates.groupName !== undefined) { sets.push(`group_name=$${idx++}`); params.push(updates.groupName); }
    if (updates.weight !== undefined) { sets.push(`weight=$${idx++}`); params.push(updates.weight); }
    if (sets.length === 0) return { ok: false, error: { category: 'validation', code: 'no_updates', message: 'No fields to update' } };
    params.push(attrId);
    const r = await this.db.query<any>(`UPDATE comparison_attribute SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, params);
    if (r.rows.length === 0) return { ok: false, error: { category: 'not_found', code: 'not_found', message: 'Attribute not found' } };
    return { ok: true, value: this.mapAttribute(r.rows[0]!) };
  }

  async deleteAttribute(attrId: string): Promise<Result<void>> {
    await this.db.query('DELETE FROM comparison_attribute WHERE id=$1', [attrId]);
    return { ok: true, value: undefined };
  }

  async listTemplates(): Promise<ComparisonTemplate[]> {
    const r = await this.db.query<any>('SELECT * FROM comparison_template ORDER BY name');
    return r.rows.map((row: any) => this.mapTemplate(row));
  }

  private mapTemplate(row: any): ComparisonTemplate {
    return { id: row.id, categoryId: row.category_id, name: row.name, slug: row.slug, attributeGroups: row.attribute_groups, layoutConfig: row.layout_config, version: row.version };
  }

  private mapAttribute(row: any): ComparisonAttribute {
    return { id: row.id, templateId: row.template_id, name: row.name, slug: row.slug, dataType: row.data_type, unit: row.unit, options: row.options, isComparable: row.is_comparable, isFilterable: row.is_filterable, isRequired: row.is_required, displayOrder: row.display_order, groupName: row.group_name, weight: Number(row.weight) };
  }
}
