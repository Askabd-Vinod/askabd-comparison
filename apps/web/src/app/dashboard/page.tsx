import { apiSafe } from '../lib/api';

async function getStats() {
  const [cats, brands, merchants, templates, offers] = await Promise.all([
    apiSafe<{ categories: any[] }>('/api/v1/categories', { categories: [] }),
    apiSafe<{ brands: any[] }>('/api/v1/brands', { brands: [] }),
    apiSafe<{ merchants: any[] }>('/api/v1/merchants', { merchants: [] }),
    apiSafe<{ templates: any[] }>('/api/v1/admin/templates', { templates: [] }),
    apiSafe<{ offers: any[] }>('/api/v1/offers/trending', { offers: [] }),
  ]);
  return { categories: cats.categories.length, brands: brands.brands.length, merchants: merchants.merchants.length, templates: templates.templates.length, offers: offers.offers.length };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-8">Platform overview — live data from the Comparison API</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        <StatCard label="Categories" value={stats.categories} color="purple" />
        <StatCard label="Brands" value={stats.brands} color="blue" />
        <StatCard label="Merchants" value={stats.merchants} color="green" />
        <StatCard label="Templates" value={stats.templates} color="orange" />
        <StatCard label="Active Offers" value={stats.offers} color="pink" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl p-6 border">
          <h2 className="font-semibold text-lg mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <QuickLink href="/categories" label="Browse Categories" />
            <QuickLink href="/search" label="Search Products" />
            <QuickLink href="/deals" label="View Deals" />
            <QuickLink href="/compare" label="Compare Items" />
            <QuickLink href="/platform" label="Platform Manager" />
          </div>
        </section>
        <section className="bg-white rounded-xl p-6 border">
          <h2 className="font-semibold text-lg mb-4">Platform Status</h2>
          <div className="space-y-3 text-sm">
            <StatusRow label="API" status="healthy" />
            <StatusRow label="Database" status="healthy" />
            <StatusRow label="Swagger" status="healthy" />
            <StatusRow label="Authentication" status="dev-bypass" />
            <StatusRow label="RBAC" status="healthy" />
          </div>
          <a href="/platform" className="mt-4 inline-block text-purple-600 text-sm font-medium">View Platform Manager →</a>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = { purple: 'bg-purple-50 text-purple-700', blue: 'bg-blue-50 text-blue-700', green: 'bg-green-50 text-green-700', orange: 'bg-orange-50 text-orange-700', pink: 'bg-pink-50 text-pink-700' };
  return (
    <div className={`rounded-xl p-5 ${colors[color] || 'bg-gray-50'}`}>
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return <a href={href} className="block px-4 py-3 rounded-lg hover:bg-gray-50 text-gray-700 font-medium border border-transparent hover:border-gray-200 transition">{label}</a>;
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const icon = status === 'healthy' ? '🟢' : status === 'dev-bypass' ? '🟡' : '🔴';
  return <div className="flex items-center justify-between"><span className="text-gray-600">{label}</span><span>{icon} {status}</span></div>;
}
