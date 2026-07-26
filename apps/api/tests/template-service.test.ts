import { describe, it, expect } from 'vitest';
import { TemplateService } from '../src/services/template-service.js';

function mockDb() {
  const templates: any[] = [];
  const attributes: any[] = [];
  return { query: async <T>(sql: string, params?: unknown[]) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into comparison_template')) {
      const [id, category_id, name, slug, attribute_groups, layout_config] = params as any[];
      const row = { id, category_id, name, slug, attribute_groups: JSON.parse(attribute_groups), layout_config: JSON.parse(layout_config), version: 1, created_at: new Date() };
      templates.push(row); return { rows: [row] as T[], rowCount: 1 };
    }
    if (s.includes('insert into comparison_attribute')) {
      const [id, template_id, name, slug, data_type, unit, options, is_comparable, is_filterable, is_required, display_order, group_name, weight] = params as any[];
      const row = { id, template_id, name, slug, data_type, unit, options: JSON.parse(options), is_comparable, is_filterable, is_required, display_order, group_name, weight };
      attributes.push(row); return { rows: [row] as T[], rowCount: 1 };
    }
    if (s.includes('select') && s.includes('comparison_template') && s.includes('category_id')) {
      const [cid] = params as string[]; return { rows: templates.filter((t) => t.category_id === cid) as T[], rowCount: 0 };
    }
    if (s.includes('select') && s.includes('comparison_attribute') && s.includes('template_id')) {
      const [tid] = params as string[]; return { rows: attributes.filter((a) => a.template_id === tid).sort((a: any, b: any) => a.display_order - b.display_order) as T[], rowCount: 0 };
    }
    if (s.includes('select') && s.includes('comparison_template') && s.includes('order by name')) {
      return { rows: templates as T[], rowCount: templates.length };
    }
    if (s.includes('update comparison_attribute')) {
      const id = params?.[params.length - 1] as string;
      const attr = attributes.find((a) => a.id === id);
      if (attr) return { rows: [attr] as T[], rowCount: 1 };
      return { rows: [] as T[], rowCount: 0 };
    }
    if (s.includes('delete from comparison_attribute')) {
      const [id] = params as string[]; const idx = attributes.findIndex((a) => a.id === id); if (idx >= 0) attributes.splice(idx, 1);
      return { rows: [] as T[], rowCount: 1 };
    }
    return { rows: [] as T[], rowCount: 0 };
  }};
}

describe('TemplateService', () => {
  it('creates a template for a category', async () => {
    const svc = new TemplateService(mockDb() as any);
    const r = await svc.createTemplate({ categoryId: 'cat_1', name: 'Smartphones', slug: 'smartphones' });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value.name).toBe('Smartphones');
    expect(r.value.categoryId).toBe('cat_1');
  });

  it('adds typed attributes to a template', async () => {
    const svc = new TemplateService(mockDb() as any);
    const tmpl = await svc.createTemplate({ categoryId: 'cat_1', name: 'Phones', slug: 'phones' });
    if (!tmpl.ok) return;
    const attr = await svc.addAttribute({ templateId: tmpl.value.id, name: 'Screen Size', slug: 'screen-size', dataType: 'number', unit: 'inches', isFilterable: true, groupName: 'Display' });
    expect(attr.ok).toBe(true); if (!attr.ok) return;
    expect(attr.value.dataType).toBe('number');
    expect(attr.value.unit).toBe('inches');
    expect(attr.value.groupName).toBe('Display');
  });

  it('rejects invalid data type', async () => {
    const svc = new TemplateService(mockDb() as any);
    const tmpl = await svc.createTemplate({ categoryId: 'cat_1', name: 'X', slug: 'x' });
    if (!tmpl.ok) return;
    const r = await svc.addAttribute({ templateId: tmpl.value.id, name: 'Bad', slug: 'bad', dataType: 'invalid' as any });
    expect(r.ok).toBe(false); if (r.ok) return;
    expect(r.error.code).toBe('invalid_data_type');
  });

  it('retrieves template with attributes for a category', async () => {
    const svc = new TemplateService(mockDb() as any);
    const tmpl = await svc.createTemplate({ categoryId: 'cat_phones', name: 'Phones', slug: 'phones' });
    if (!tmpl.ok) return;
    await svc.addAttribute({ templateId: tmpl.value.id, name: 'RAM', slug: 'ram', dataType: 'number', unit: 'GB', displayOrder: 1 });
    await svc.addAttribute({ templateId: tmpl.value.id, name: 'Storage', slug: 'storage', dataType: 'number', unit: 'GB', displayOrder: 2 });
    await svc.addAttribute({ templateId: tmpl.value.id, name: 'Battery', slug: 'battery', dataType: 'number', unit: 'mAh', displayOrder: 3 });
    const loaded = await svc.getTemplateByCategory('cat_phones');
    expect(loaded).not.toBeNull();
    expect(loaded!.attributes).toHaveLength(3);
    expect(loaded!.attributes![0]!.slug).toBe('ram');
    expect(loaded!.attributes![2]!.slug).toBe('battery');
  });

  it('supports all 8 attribute types', async () => {
    const svc = new TemplateService(mockDb() as any);
    const tmpl = await svc.createTemplate({ categoryId: 'cat_all', name: 'All Types', slug: 'all' });
    if (!tmpl.ok) return;
    const types = ['text', 'number', 'boolean', 'date', 'enum', 'url', 'currency', 'rating'] as const;
    for (const type of types) {
      const r = await svc.addAttribute({ templateId: tmpl.value.id, name: type, slug: type, dataType: type });
      expect(r.ok).toBe(true);
    }
    const attrs = await svc.getAttributes(tmpl.value.id);
    expect(attrs).toHaveLength(8);
  });

  it('rejects missing template name', async () => {
    const svc = new TemplateService(mockDb() as any);
    const r = await svc.createTemplate({ categoryId: 'cat_1', name: '', slug: '' });
    expect(r.ok).toBe(false);
  });
});
