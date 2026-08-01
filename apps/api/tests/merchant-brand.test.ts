import { describe, it, expect, vi } from 'vitest';
import { BrandService, MerchantService } from '../src/services/merchant-brand-prisma.js';

function mockPrisma() {
  const brands: any[] = []; const merchants: any[] = []; const verifications: any[] = []; const branches: any[] = [];
  let counter = 0;
  const uid = () => `00000000-0000-0000-0000-00000000${String(++counter).padStart(4, '0')}`;

  return {
    brand: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, verified: false, categories: [], media: [], created_at: new Date() }; brands.push(row); return row; }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => { const b = brands.find(x => x.id === where.id); if (!b) throw { code: 'P2025' }; Object.assign(b, data); return b; }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => { if (where.id) return brands.find(x => x.id === where.id) ?? null; if (where.slug) return brands.find(x => x.slug === where.slug) ?? null; return null; }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.OR) return brands.filter(b => b.name.toLowerCase().includes((where.OR[0]?.name?.contains ?? '').toLowerCase()));
        return brands;
      }),
    },
    merchant: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, trust_score: 0, commission_rate: 0, verified: false, social_links: {}, policies: {}, created_at: new Date() }; merchants.push(row); return row; }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => { const m = merchants.find(x => x.id === where.id); if (!m) throw { code: 'P2025' }; Object.assign(m, data); return m; }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => merchants.find(x => x.id === where.id) ?? null),
      findMany: vi.fn().mockImplementation(async () => merchants),
    },
    merchant_verification: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, reviewer_id: null, reviewed_at: null, notes: null, expires_at: null, created_at: new Date() }; verifications.push(row); return row; }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => { const v = verifications.find(x => x.id === where.id); if (!v) throw { code: 'P2025' }; Object.assign(v, data); return v; }),
    },
    merchant_branch: {
      create: vi.fn().mockImplementation(async ({ data }: any) => { const row = { id: uid(), ...data, status: 'active' }; branches.push(row); return row; }),
    },
  };
}

describe('BrandService (Prisma)', () => {
  it('creates a brand', async () => { const svc = new BrandService(mockPrisma() as any); const r = await svc.create({ name: 'Apple', slug: 'apple', website: 'https://apple.com' }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.name).toBe('Apple'); });
  it('rejects duplicate slug', async () => { const p = mockPrisma(); p.brand.create.mockRejectedValueOnce({ code: 'P2002' }); const svc = new BrandService(p as any); const r = await svc.create({ name: 'B', slug: 'dup' }); expect(r.ok).toBe(false); if (r.ok) return; expect(r.error.code).toBe('slug_exists'); });
  it('searches brands', async () => { const svc = new BrandService(mockPrisma() as any); await svc.create({ name: 'Samsung', slug: 'samsung' }); const results = await svc.search('sam'); expect(results.length).toBe(1); });
});

describe('MerchantService (Prisma)', () => {
  it('registers merchant as pending', async () => { const svc = new MerchantService(mockPrisma() as any); const r = await svc.register({ name: 'MegaStore', slug: 'megastore' }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('pending'); });
  it('approves merchant', async () => { const svc = new MerchantService(mockPrisma() as any); const reg = await svc.register({ name: 'Shop', slug: 'shop' }); if (!reg.ok) return; const r = await svc.approve(reg.value.id); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('active'); expect(r.value.verified).toBe(true); });
  it('suspends merchant', async () => { const svc = new MerchantService(mockPrisma() as any); const reg = await svc.register({ name: 'Bad', slug: 'bad' }); if (!reg.ok) return; await svc.approve(reg.value.id); const r = await svc.suspend(reg.value.id); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('suspended'); });
  it('submits verification', async () => { const svc = new MerchantService(mockPrisma() as any); const reg = await svc.register({ name: 'V', slug: 'v' }); if (!reg.ok) return; const r = await svc.submitVerification({ merchantId: reg.value.id, level: 'premium' }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.level).toBe('premium'); expect(r.value.status).toBe('pending'); });
  it('reviews verification', async () => { const svc = new MerchantService(mockPrisma() as any); const reg = await svc.register({ name: 'R', slug: 'r' }); if (!reg.ok) return; const v = await svc.submitVerification({ merchantId: reg.value.id, level: 'verified' }); if (!v.ok) return; const r = await svc.reviewVerification(v.value.id, 'approved', 'admin_1', 'All good'); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.status).toBe('approved'); });
  it('adds branch', async () => { const svc = new MerchantService(mockPrisma() as any); const reg = await svc.register({ name: 'Multi', slug: 'multi' }); if (!reg.ok) return; const r = await svc.addBranch({ merchantId: reg.value.id, name: 'NYC Office', city: 'New York', country: 'US', isHeadquarters: true }); expect(r.ok).toBe(true); if (!r.ok) return; expect(r.value.isHeadquarters).toBe(true); });
});
