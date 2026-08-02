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
    <div className="max-w-7xl mx-auto px-4 py-8 animate-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 mt-1">Your comparison platform overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Categories" value={stats.categories} icon="📦" />
        <StatCard label="Brands" value={stats.brands} icon="🏷️" />
        <StatCard label="Merchants" value={stats.merchants} icon="🏪" />
        <StatCard label="Templates" value={stats.templates} icon="📋" />
        <StatCard label="Active Deals" value={stats.offers} icon="🔥" />
      </div>

      {/* Quick Actions + Activity */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold text-lg mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <ActionCard href="/search" icon="🔍" label="Search Products" />
            <ActionCard href="/compare" icon="⚖️" label="Compare Items" />
            <ActionCard href="/deals" icon="💰" label="View Deals" />
            <ActionCard href="/categories" icon="📁" label="Browse Categories" />
          </div>
        </div>
        <div className="card p-6">
          <h2 className="font-semibold text-lg mb-4">Recent Activity</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="w-8 h-8 bg-purple-50 rounded-full flex items-center justify-center text-sm">🔍</div>
              <div><p className="font-medium text-gray-900">Session started</p><p className="text-xs text-gray-400">Just now</p></div>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-sm">📊</div>
              <div><p className="font-medium text-gray-900">Platform healthy</p><p className="text-xs text-gray-400">All systems operational</p></div>
            </div>
          </div>
          <a href="/platform" className="text-purple-600 text-sm font-medium mt-4 inline-block hover:text-purple-700">View Platform Status →</a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="text-2xl">{icon}</div>
      <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
    </div>
  );
}

function ActionCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a href={href} className="card p-4 text-center hover:border-purple-200">
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-xs font-medium text-gray-700">{label}</p>
    </a>
  );
}
