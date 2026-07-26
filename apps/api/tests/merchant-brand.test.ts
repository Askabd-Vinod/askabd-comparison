import { describe, it, expect } from 'vitest';
import { BrandService, MerchantService } from '../src/services/merchant-brand-service.js';

function mockDb() {
  const brands: any[] = []; const merchants: any[] = []; const verifications: any[] = []; const branches: any[] = [];
  return { query: async <T>(sql: string, params?: unknown[]) => {
    const s = sql.toLowerCase();
    if (s.includes('insert into brand')) { const [id, name, slug, logo_url, description, website, manufacturer, aliases, social_links] = params as any[]; const row = { id, name, slug, logo_url, description, website, manufacturer, aliases, social_links: JSON.parse(social_links), verified: false, status: 'active', media: [], categories: [], created_at: new Date() }; brands.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('select') && s.includes('brand') && s.includes('slug=$1') && !s.includes('ilike')) { const [slug] = params as string[]; return { rows: brands.filter((b) => b.slug === slug) as T[], rowCount: 0 }; }
    if (s.includes('select') && s.includes('brand') && s.includes('id=$1')) { const [id] = params as string[]; return { rows: brands.filter((b) => b.id === id) as T[], rowCount: 0 }; }
    if (s.includes('select') && s.includes('brand') && s.includes('ilike')) { const [q] = params as string[]; return { rows: brands.filter((b) => b.name.toLowerCase().includes(q.replace(/%/g, '').toLowerCase())) as T[], rowCount: 0 }; }
    if (s.includes('select') && s.includes('brand') && s.includes('order by name')) { return { rows: brands as T[], rowCount: brands.length }; }
    if (s.includes('update brand')) { const id = params?.[params.length - 1] as string; const b = brands.find((x) => x.id === id); if (b && params?.[0]) b.name = params[0]; return { rows: b ? [b] as T[] : [] as T[], rowCount: b ? 1 : 0 }; }
    if (s.includes('insert into merchant') && !s.includes('verification') && !s.includes('branch')) { const [id,,name, slug] = params as any[]; const row = { id, tenant_id: 'public', name, slug, logo_url: null, website: null, description: null, registration_number: null, business_type: null, trust_score: 0, commission_rate: 0, verified: false, status: 'pending', certifications: [], tags: [], social_links: {}, policies: {}, created_at: new Date() }; merchants.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('update merchant') && s.includes("'active'") && s.includes('verified=true')) { const [id] = params as string[]; const m = merchants.find((x) => x.id === id); if (m) { m.status = 'active'; m.verified = true; } return { rows: m ? [m] as T[] : [] as T[], rowCount: m ? 1 : 0 }; }
    if (s.includes('update merchant') && s.includes("'suspended'")) { const [id] = params as string[]; const m = merchants.find((x) => x.id === id); if (m) m.status = 'suspended'; return { rows: m ? [m] as T[] : [] as T[], rowCount: m ? 1 : 0 }; }
    if (s.includes('select') && s.includes('merchant') && s.includes('id=$1') && !s.includes('verification')) { const [id] = params as string[]; return { rows: merchants.filter((m) => m.id === id) as T[], rowCount: 0 }; }
    if (s.includes('insert into merchant_verification')) { const [id, merchant_id, level, status, documents] = params as any[]; const row = { id, merchant_id, level, status, documents: JSON.parse(documents), reviewer_id: null, notes: null, expires_at: null, created_at: new Date() }; verifications.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    if (s.includes('update merchant_verification')) { const [status, reviewer_id, notes, id] = params as any[]; const v = verifications.find((x) => x.id === id); if (v) { v.status = status; v.reviewer_id = reviewer_id; v.notes = notes; } return { rows: v ? [v] as T[] : [] as T[], rowCount: v ? 1 : 0 }; }
    if (s.includes('insert into merchant_branch')) { const [id, merchant_id, name, city, country, is_headquarters] = params as any[]; const row = { id, merchant_id, name, city, country, is_headquarters, status: 'active' }; branches.push(row); return { rows: [row] as T[], rowCount: 1 }; }
    return { rows: [] as T[], rowCount: 0 };
  }};
}

describe('BrandService', () => {
  it('creates a brand', async () => { const svc = new BrandService(mockDb() as any); const r = await svc.create({ name: 'Apple', slug: 'apple', website: 'https://apple.com' }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.name).toBe('Apple'); });
  it('rejects duplicate slug', async () => { const svc = new BrandService(mockDb() as any); await svc.create({ name: 'A', slug: 'dup' }); const r = await svc.create({ name: 'B', slug: 'dup' }); expect(r.ok).toBe(false); });
  it('searches brands', async () => { const svc = new BrandService(mockDb() as any); await svc.create({ name: 'Samsung', slug: 'samsung' }); const results = await svc.search('sam'); expect(results.length).toBe(1); });
});

describe('MerchantService', () => {
  it('registers merchant as pending', async () => { const svc = new MerchantService(mockDb() as any); const r = await svc.register({ name: 'MegaStore', slug: 'megastore' }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('pending'); });
  it('approves merchant', async () => { const svc = new MerchantService(mockDb() as any); const reg = await svc.register({ name: 'Shop', slug: 'shop' }); if (!reg.ok) return; const r = await svc.approve(reg.value.id); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('active'); expect(r.value.verified).toBe(true); });
  it('suspends merchant', async () => { const svc = new MerchantService(mockDb() as any); const reg = await svc.register({ name: 'Bad', slug: 'bad' }); if (!reg.ok) return; await svc.approve(reg.value.id); const r = await svc.suspend(reg.value.id); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('suspended'); });
  it('submits verification', async () => { const svc = new MerchantService(mockDb() as any); const reg = await svc.register({ name: 'V', slug: 'v' }); if (!reg.ok) return; const r = await svc.submitVerification({ merchantId: reg.value.id, level: 'premium' }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.level).toBe('premium'); expect(r.value.status).toBe('pending'); });
  it('reviews verification', async () => { const svc = new MerchantService(mockDb() as any); const reg = await svc.register({ name: 'R', slug: 'r' }); if (!reg.ok) return; const v = await svc.submitVerification({ merchantId: reg.value.id, level: 'verified' }); if (!v.ok) return; const r = await svc.reviewVerification(v.value.id, 'approved', 'admin_1', 'All good'); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('approved'); });
  it('adds branch', async () => { const svc = new MerchantService(mockDb() as any); const reg = await svc.register({ name: 'Multi', slug: 'multi' }); if (!reg.ok) return; const r = await svc.addBranch({ merchantId: reg.value.id, name: 'NYC Office', city: 'New York', country: 'US', isHeadquarters: true }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.isHeadquarters).toBe(true); });
});
