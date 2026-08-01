import { describe, it, expect, vi } from 'vitest';
import { TemplateService } from '../src/services/template-service-prisma.js';

function mockPrisma() {
  const templates: any[] = [];
  const attributes: any[] = [];
  let tmplCounter = 0;
  let attrCounter = 0;

  return {
    comparison_template: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        tmplCounter++;
        const row = { id: `00000000-0000-0000-0000-00000000010${tmplCounter}`, ...data, version: 1, created_at: new Date() };
        templates.push(row);
        return row;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where, include }: any) => {
        const tmpl = templates.find(t => t.category_id === where.category_id);
        if (!tmpl) return null;
        if (include?.comparison_attribute) {
          return { ...tmpl, comparison_attribute: attributes.filter(a => a.template_id === tmpl.id).sort((a: any, b: any) => a.display_order - b.display_order) };
        }
        return tmpl;
      }),
      findMany: vi.fn().mockImplementation(async () => templates),
    },
    comparison_attribute: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        attrCounter++;
        const row = { id: `00000000-0000-0000-0000-00000000020${attrCounter}`, ...data };
        attributes.push(row);
        return row;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return attributes.filter(a => a.template_id === where.template_id).sort((a: any, b: any) => a.display_order - b.display_order);
      }),
      update: vi.fn().mockImplementation(async ({ where }: any) => {
        const attr = attributes.find(a => a.id === where.id);
        if (!attr) throw { code: 'P2025' };
        return attr;
      }),
      delete: vi.fn().mockImplementation(async ({ where }: any) => {
        const idx = attributes.findIndex(a => a.id === where.id);
        if (idx < 0) throw { code: 'P2025' };
        attributes.splice(idx, 1);
      }),
    },
  };
}

describe('TemplateService (Prisma)', () => {
  it('creates a template for a category', async () => {
    const svc = new TemplateService(mockPrisma() as any);
    const r = await svc.createTemplate({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'Smartphones', slug: 'smartphones' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Smartphones');
    expect(r.value.categoryId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('adds typed attributes to a template', async () => {
    const prisma = mockPrisma();
    const svc = new TemplateService(prisma as any);
    const tmpl = await svc.createTemplate({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'Phones', slug: 'phones' });
    if (!tmpl.ok) return;
    const attr = await svc.addAttribute({ templateId: tmpl.value.id, name: 'Screen Size', slug: 'screen-size', dataType: 'number', unit: 'inches', isFilterable: true, groupName: 'Display' });
    expect(attr.ok).toBe(true);
    if (!attr.ok) return;
    expect(attr.value.dataType).toBe('number');
    expect(attr.value.unit).toBe('inches');
    expect(attr.value.groupName).toBe('Display');
  });

  it('rejects invalid data type', async () => {
    const svc = new TemplateService(mockPrisma() as any);
    const tmpl = await svc.createTemplate({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'X', slug: 'x' });
    if (!tmpl.ok) return;
    const r = await svc.addAttribute({ templateId: tmpl.value.id, name: 'Bad', slug: 'bad', dataType: 'invalid' as any });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('invalid_data_type');
  });

  it('retrieves template with attributes for a category', async () => {
    const prisma = mockPrisma();
    const svc = new TemplateService(prisma as any);
    const tmpl = await svc.createTemplate({ categoryId: '00000000-0000-0000-0000-000000000002', name: 'Phones', slug: 'phones' });
    if (!tmpl.ok) return;
    await svc.addAttribute({ templateId: tmpl.value.id, name: 'RAM', slug: 'ram', dataType: 'number', unit: 'GB', displayOrder: 1 });
    await svc.addAttribute({ templateId: tmpl.value.id, name: 'Storage', slug: 'storage', dataType: 'number', unit: 'GB', displayOrder: 2 });
    await svc.addAttribute({ templateId: tmpl.value.id, name: 'Battery', slug: 'battery', dataType: 'number', unit: 'mAh', displayOrder: 3 });
    const loaded = await svc.getTemplateByCategory('00000000-0000-0000-0000-000000000002');
    expect(loaded).not.toBeNull();
    expect(loaded!.attributes).toHaveLength(3);
    expect(loaded!.attributes![0]!.slug).toBe('ram');
    expect(loaded!.attributes![2]!.slug).toBe('battery');
  });

  it('supports all 8 attribute types', async () => {
    const prisma = mockPrisma();
    const svc = new TemplateService(prisma as any);
    const tmpl = await svc.createTemplate({ categoryId: '00000000-0000-0000-0000-000000000003', name: 'All', slug: 'all' });
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
    const svc = new TemplateService(mockPrisma() as any);
    const r = await svc.createTemplate({ categoryId: '00000000-0000-0000-0000-000000000001', name: '', slug: '' });
    expect(r.ok).toBe(false);
  });
});
